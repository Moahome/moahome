-- 수동 지출의 본문·ID·배분은 유지하고 은행 원본 연결만 별도 불변 감사 기록으로 보존합니다.
CREATE TABLE expense_bank_links (
 bank_transaction_id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 expense_id uuid NOT NULL,
 linked_by uuid NOT NULL REFERENCES users(id),
 linked_at timestamptz NOT NULL,
 FOREIGN KEY(property_id,bank_transaction_id) REFERENCES bank_transactions(property_id,id),
 FOREIGN KEY(property_id,expense_id) REFERENCES expenses(property_id,id)
);
CREATE INDEX expense_bank_links_expense_idx ON expense_bank_links(property_id,expense_id);
CREATE TRIGGER expense_bank_links_immutable BEFORE UPDATE OR DELETE ON expense_bank_links
 FOR EACH ROW EXECUTE FUNCTION protect_income_statement_history();

-- 출처는 최초 등록 방식을 유지합니다. 수동 지출의 활성 원본도 기존 UNIQUE 제약을 공유합니다.
ALTER TABLE expenses DROP CONSTRAINT expenses_source_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_source_check CHECK(
 (source_type='BANK_IMPORT' AND bank_transaction_id IS NOT NULL AND rule_key IS NOT NULL)
 OR (source_type='MANUAL' AND rule_key IS NULL AND NOT save_as_rule));

CREATE OR REPLACE FUNCTION protect_expense_with_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.source_type<>'MANUAL'
  OR (to_jsonb(NEW)-'deleted_at'-'deleted_by'-'bank_transaction_id')
    IS DISTINCT FROM (to_jsonb(OLD)-'deleted_at'-'deleted_by'-'bank_transaction_id') THEN
  RAISE EXCEPTION 'confirmed expense is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.bank_transaction_id IS DISTINCT FROM OLD.bank_transaction_id THEN
  IF OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL
   OR (OLD.bank_transaction_id IS NOT NULL AND NEW.bank_transaction_id IS NOT NULL)
   OR (OLD.bank_transaction_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM bank_transactions WHERE id=OLD.bank_transaction_id AND deleted_at IS NOT NULL)) THEN
   RAISE EXCEPTION 'invalid manual expense bank transition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD.bank_transaction_id IS NOT NULL OR OLD.deleted_at IS NOT NULL
  OR NEW.deleted_at IS NULL OR NEW.deleted_by IS NULL THEN
  RAISE EXCEPTION 'confirmed expense is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

-- 같은 관리대상의 연결·삭제·확정을 직렬화하고 최종 상태를 커밋 때 검사합니다.
-- 원본 삭제를 먼저 저장한 뒤 연결을 해제하므로 중간 상태는 허용하되 부분 커밋은 금지합니다.
CREATE FUNCTION validate_manual_expense_bank_links() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE selected_expense uuid; selected_bank uuid;
BEGIN
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 -- 대량 업로드·선택 삭제에서도 변경한 지출·원본의 연결만 검증합니다.
 IF TG_TABLE_NAME='expenses' THEN selected_expense=NEW.id;
 ELSIF TG_TABLE_NAME='expense_bank_links' THEN selected_expense=NEW.expense_id;
 ELSE selected_bank=NEW.id; END IF;
 IF EXISTS(
  SELECT 1 FROM expenses e LEFT JOIN bank_transactions b ON b.id=e.bank_transaction_id
   LEFT JOIN expense_bank_links l ON l.bank_transaction_id=e.bank_transaction_id AND l.expense_id=e.id
  WHERE e.property_id=NEW.property_id AND e.source_type='MANUAL' AND e.bank_transaction_id IS NOT NULL
   AND (e.id=selected_expense OR e.bank_transaction_id=selected_bank)
   AND (l.bank_transaction_id IS NULL OR e.deleted_at IS NOT NULL OR b.deleted_at IS NOT NULL
    OR b.property_id<>e.property_id OR b.bank_account_id<>e.bank_account_id OR b.direction<>'EXPENSE'
    OR b.transaction_date<>e.expense_date OR b.amount<>e.total_amount OR b.transfer_candidate)) THEN
  RAISE EXCEPTION 'invalid manual expense bank link' USING ERRCODE='23514';
 END IF;
 IF EXISTS(
  SELECT 1 FROM expense_bank_links l JOIN expenses e ON e.id=l.expense_id
   JOIN bank_transactions b ON b.id=l.bank_transaction_id
  WHERE l.property_id=NEW.property_id AND (l.expense_id=selected_expense OR l.bank_transaction_id=selected_bank) AND
   (e.source_type<>'MANUAL' OR b.bank_account_id<>e.bank_account_id OR b.direction<>'EXPENSE'
    OR b.transaction_date<>e.expense_date OR b.amount<>e.total_amount OR b.transfer_candidate
    OR (b.deleted_at IS NULL AND e.bank_transaction_id IS DISTINCT FROM b.id)
    OR (b.deleted_at IS NOT NULL AND e.bank_transaction_id=b.id))) THEN
  RAISE EXCEPTION 'manual expense bank history mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER manual_expense_bank_links_check AFTER INSERT ON expense_bank_links
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_manual_expense_bank_links();
CREATE CONSTRAINT TRIGGER expenses_bank_links_check AFTER INSERT OR UPDATE ON expenses
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_manual_expense_bank_links();
CREATE CONSTRAINT TRIGGER bank_sources_expense_links_check AFTER UPDATE ON bank_transactions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_manual_expense_bank_links();
