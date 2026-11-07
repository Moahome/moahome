-- 수동 지출도 확정 원본·배분을 보존한 채 삭제할 수 있습니다. 기존 행은 활성 상태로 유지합니다.
ALTER TABLE expenses
 ADD COLUMN deleted_at timestamptz,
 ADD COLUMN deleted_by uuid REFERENCES users(id),
 ADD CONSTRAINT expenses_deletion_audit_check CHECK ((deleted_at IS NULL)=(deleted_by IS NULL));

CREATE FUNCTION protect_expense_with_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.source_type<>'MANUAL'
  OR (to_jsonb(NEW)-'deleted_at'-'deleted_by') IS DISTINCT FROM (to_jsonb(OLD)-'deleted_at'-'deleted_by')
  OR (OLD.deleted_at IS NOT NULL AND (NEW.deleted_at,NEW.deleted_by) IS DISTINCT FROM (OLD.deleted_at,OLD.deleted_by))
  OR NEW.deleted_at IS NULL OR NEW.deleted_by IS NULL THEN
  RAISE EXCEPTION 'confirmed expense is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER expenses_immutable ON expenses;
CREATE TRIGGER expenses_immutable BEFORE UPDATE OR DELETE ON expenses
 FOR EACH ROW EXECUTE FUNCTION protect_expense_with_deletion();

-- 103은 비용이 아닌 자산 이동이며 지출 분류 이력에서 명시적으로 선택할 수 있습니다.
CREATE OR REPLACE FUNCTION validate_expense_accounting_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE start_date date; last_revision integer; selected_group varchar(30); selected_code varchar(3);
BEGIN
 SELECT start_month INTO start_date FROM accounting_profiles WHERE property_id=NEW.property_id FOR UPDATE;
 SELECT report_group,code INTO selected_group,selected_code FROM accounting_accounts
  WHERE property_id=NEW.property_id AND id=NEW.account_id;
 SELECT coalesce(max(revision),0) INTO last_revision FROM expense_accounting_reviews
  WHERE property_id=NEW.property_id AND expense_id=NEW.expense_id;
 IF start_date IS NULL OR selected_group IS NULL
  OR NOT (selected_group IN ('OPERATING_EXPENSE','OTHER_EXPENSE') OR (selected_group='ASSET' AND selected_code='103'))
  OR NEW.revision<>last_revision+1 THEN
  RAISE EXCEPTION 'invalid expense accounting review' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

-- 이미 저장된 실제 출금·입금을 연결하므로 가짜 은행 원본이나 새 현금 이동을 생성하지 않습니다.
-- 정정을 하면 새 지출 revision을 만들고 이전 연결은 감사 이력으로 보존합니다.
CREATE TABLE accounting_transfer_matches (
 review_id uuid PRIMARY KEY REFERENCES expense_accounting_reviews(id),
 property_id uuid NOT NULL REFERENCES properties(id),
 expense_id uuid NOT NULL,
 payment_id uuid NOT NULL,
 FOREIGN KEY(property_id,expense_id) REFERENCES expenses(property_id,id),
 FOREIGN KEY(property_id,payment_id) REFERENCES payments(property_id,id)
);
CREATE INDEX accounting_transfer_matches_property_idx ON accounting_transfer_matches(property_id);
CREATE TRIGGER accounting_transfer_matches_immutable BEFORE UPDATE OR DELETE ON accounting_transfer_matches
 FOR EACH ROW EXECUTE FUNCTION protect_income_statement_history();

CREATE FUNCTION validate_accounting_transfer_match() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE outgoing expenses%ROWTYPE; incoming payments%ROWTYPE; selected expense_accounting_reviews%ROWTYPE;
BEGIN
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 SELECT * INTO outgoing FROM expenses WHERE property_id=NEW.property_id AND id=NEW.expense_id;
 SELECT * INTO incoming FROM payments WHERE property_id=NEW.property_id AND id=NEW.payment_id;
 SELECT * INTO selected FROM expense_accounting_reviews WHERE id=NEW.review_id;
 IF outgoing.id IS NULL OR incoming.id IS NULL OR selected.id IS NULL
  OR outgoing.deleted_at IS NOT NULL OR incoming.deleted_at IS NOT NULL
  OR incoming.status<>'CONFIRMED' OR incoming.receipt_type<>'OTHER'
  OR outgoing.bank_account_id=incoming.bank_account_id OR outgoing.total_amount<>incoming.amount
  OR outgoing.expense_date<>incoming.payment_date
  OR selected.property_id<>NEW.property_id OR selected.expense_id<>NEW.expense_id
  OR EXISTS(SELECT 1 FROM expense_accounting_reviews later WHERE later.property_id=NEW.property_id
    AND later.expense_id=NEW.expense_id AND later.revision>selected.revision)
  OR NOT EXISTS(SELECT 1 FROM accounting_accounts a WHERE a.id=selected.account_id AND a.report_group='ASSET' AND a.code='103')
  OR EXISTS(SELECT 1 FROM bank_transactions t WHERE t.id IN (outgoing.bank_transaction_id,incoming.bank_transaction_id)
    AND (t.deleted_at IS NOT NULL OR t.transfer_candidate))
  OR EXISTS(SELECT 1 FROM external_settlement_links l WHERE l.payment_id=NEW.payment_id)
  OR EXISTS(SELECT 1 FROM accounting_transfer_matches m JOIN expense_accounting_reviews r ON r.id=m.review_id
    JOIN expenses e ON e.id=m.expense_id WHERE m.property_id=NEW.property_id AND m.payment_id=NEW.payment_id
    AND e.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM expense_accounting_reviews later
      WHERE later.property_id=r.property_id AND later.expense_id=r.expense_id AND later.revision>r.revision)) THEN
  RAISE EXCEPTION 'invalid accounting transfer match' USING ERRCODE='23514';
 END IF;
 -- 동별 소유금이 바뀌는 재분류를 막고, 기존 두 거래의 동별 금액이 같은 경우에만 연결합니다.
 IF EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND has_buildings) AND (
  NOT EXISTS(SELECT 1 FROM expense_allocations WHERE expense_id=NEW.expense_id)
  OR EXISTS(SELECT 1 FROM expense_allocations WHERE expense_id=NEW.expense_id AND building_id IS NULL)
  OR EXISTS((SELECT building_id,sum(allocated_amount) FROM expense_allocations WHERE expense_id=NEW.expense_id GROUP BY building_id)
    EXCEPT (SELECT building_id,sum(amount) FROM income_allocations WHERE payment_id=NEW.payment_id GROUP BY building_id))
  OR EXISTS((SELECT building_id,sum(amount) FROM income_allocations WHERE payment_id=NEW.payment_id GROUP BY building_id)
    EXCEPT (SELECT building_id,sum(allocated_amount) FROM expense_allocations WHERE expense_id=NEW.expense_id GROUP BY building_id))
 ) THEN
  RAISE EXCEPTION 'accounting transfer allocation mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER accounting_transfer_matches_check BEFORE INSERT ON accounting_transfer_matches
 FOR EACH ROW EXECUTE FUNCTION validate_accounting_transfer_match();
