-- 미지급 발생은 실제 통장 지출과 분리합니다. 지급 연결은 기존 expenses를 참조하며 새 현금 이동을 만들지 않습니다.
CREATE TABLE payable_expenses (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 expense_account_id uuid NOT NULL,
 payable_account_id uuid NOT NULL,
 building_id uuid,
 occurred_date date NOT NULL,
 name_encrypted text NOT NULL,
 counterparty_encrypted text NOT NULL,
 memo_encrypted text,
 amount numeric(15,0) NOT NULL CHECK(amount>0),
 status varchar(20) NOT NULL CHECK(status IN ('REGISTERED','CANCELED')),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL,
 canceled_by uuid REFERENCES users(id),
 canceled_at timestamptz,
 UNIQUE(property_id,id),
 FOREIGN KEY(property_id,expense_account_id) REFERENCES accounting_accounts(property_id,id),
 FOREIGN KEY(property_id,payable_account_id) REFERENCES accounting_accounts(property_id,id),
 FOREIGN KEY(property_id,building_id) REFERENCES buildings(property_id,id),
 CHECK((status='REGISTERED' AND canceled_by IS NULL AND canceled_at IS NULL)
    OR (status='CANCELED' AND canceled_by IS NOT NULL AND canceled_at IS NOT NULL))
);
CREATE INDEX payable_expenses_property_date_idx ON payable_expenses(property_id,occurred_date);

CREATE TABLE payable_settlements (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 payable_id uuid NOT NULL,
 expense_id uuid NOT NULL,
 payment_date date NOT NULL,
 amount numeric(15,0) NOT NULL CHECK(amount>0),
 status varchar(20) NOT NULL CHECK(status IN ('ACTIVE','CANCELED')),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL,
 canceled_by uuid REFERENCES users(id),
 canceled_at timestamptz,
 FOREIGN KEY(property_id,payable_id) REFERENCES payable_expenses(property_id,id),
 FOREIGN KEY(property_id,expense_id) REFERENCES expenses(property_id,id),
 CHECK((status='ACTIVE' AND canceled_by IS NULL AND canceled_at IS NULL)
    OR (status='CANCELED' AND canceled_by IS NOT NULL AND canceled_at IS NOT NULL))
);
CREATE UNIQUE INDEX payable_settlements_active_expense_idx ON payable_settlements(expense_id) WHERE status='ACTIVE';
CREATE INDEX payable_settlements_property_idx ON payable_settlements(property_id,payable_id);

CREATE FUNCTION validate_payable_expense() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE has_buildings boolean;
BEGIN
 SELECT p.has_buildings INTO has_buildings FROM properties p WHERE p.id=NEW.property_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM accounting_accounts WHERE property_id=NEW.property_id AND id=NEW.expense_account_id
   AND report_group IN ('OPERATING_EXPENSE','OTHER_EXPENSE'))
  OR NOT EXISTS(SELECT 1 FROM accounting_accounts WHERE property_id=NEW.property_id AND id=NEW.payable_account_id
   AND system_key='PAYABLE' AND report_group='LIABILITY')
  OR (has_buildings AND (NEW.building_id IS NULL OR NOT EXISTS(SELECT 1 FROM buildings WHERE property_id=NEW.property_id
   AND id=NEW.building_id AND deleted_at IS NULL AND status='ACTIVE')))
  OR (NOT has_buildings AND NEW.building_id IS NOT NULL) THEN
  RAISE EXCEPTION 'invalid payable source' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payable_expenses_validate BEFORE INSERT ON payable_expenses FOR EACH ROW EXECUTE FUNCTION validate_payable_expense();

-- 같은 관리대상·미지급 행을 잠가 동시 지급의 잔액 초과를 막습니다. 실패하면 전체 트랜잭션을 되돌립니다.
CREATE FUNCTION validate_payable_settlement() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE payable payable_expenses%ROWTYPE; outgoing expenses%ROWTYPE; current_account uuid; paid numeric;
BEGIN
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 SELECT * INTO payable FROM payable_expenses WHERE property_id=NEW.property_id AND id=NEW.payable_id FOR UPDATE;
 SELECT * INTO outgoing FROM expenses WHERE property_id=NEW.property_id AND id=NEW.expense_id FOR UPDATE;
 SELECT account_id INTO current_account FROM expense_accounting_reviews WHERE property_id=NEW.property_id
   AND expense_id=NEW.expense_id ORDER BY revision DESC LIMIT 1;
 current_account=coalesce(current_account,outgoing.accounting_account_id,payable.expense_account_id);
 SELECT coalesce(sum(amount),0) INTO paid FROM payable_settlements WHERE payable_id=NEW.payable_id AND status='ACTIVE';
 IF payable.id IS NULL OR outgoing.id IS NULL OR payable.status<>'REGISTERED' OR outgoing.deleted_at IS NOT NULL
  OR NEW.status<>'ACTIVE' OR NEW.payment_date<>outgoing.expense_date OR NEW.amount<>outgoing.total_amount
  OR current_account<>payable.expense_account_id OR NEW.payment_date<payable.occurred_date
  OR paid+NEW.amount>payable.amount
  OR EXISTS(SELECT 1 FROM bank_transactions WHERE id=outgoing.bank_transaction_id AND (deleted_at IS NOT NULL OR transfer_candidate))
  OR (payable.building_id IS NOT NULL AND (
   (SELECT count(*) FROM expense_allocations WHERE expense_id=outgoing.id)<>1
   OR NOT EXISTS(SELECT 1 FROM expense_allocations WHERE expense_id=outgoing.id AND building_id=payable.building_id
    AND allocated_amount=NEW.amount))) THEN
  RAISE EXCEPTION 'invalid payable payment' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payable_settlements_validate BEFORE INSERT ON payable_settlements FOR EACH ROW EXECUTE FUNCTION validate_payable_settlement();

-- 금액·발생일·원본 ID는 유지하고 취소자·시각만 한 번 기록하며 이력을 삭제하지 않습니다.
CREATE FUNCTION protect_payable_history() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payable history is immutable' USING ERRCODE='23514'; END IF;
 PERFORM id FROM properties WHERE id=OLD.property_id FOR UPDATE;
 IF (to_jsonb(NEW)-ARRAY['status','canceled_by','canceled_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','canceled_by','canceled_at'])
  OR OLD.status='CANCELED' OR NEW.status<>'CANCELED' OR NEW.canceled_by IS NULL OR NEW.canceled_at IS NULL THEN
  RAISE EXCEPTION 'payable history is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='payable_expenses' AND EXISTS(SELECT 1 FROM payable_settlements WHERE payable_id=OLD.id AND status='ACTIVE') THEN
  RAISE EXCEPTION 'payable has payments' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payable_expenses_immutable BEFORE UPDATE OR DELETE ON payable_expenses FOR EACH ROW EXECUTE FUNCTION protect_payable_history();
CREATE TRIGGER payable_settlements_immutable BEFORE UPDATE OR DELETE ON payable_settlements FOR EACH ROW EXECUTE FUNCTION protect_payable_history();

-- 연결된 출금 삭제·다른 과목 재분류는 먼저 연결을 해제해야 허용합니다. 확정 원본과 202 감소의 불일치를 막습니다.
CREATE FUNCTION protect_payable_payment_source() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE target_id uuid;
BEGIN
 IF TG_TABLE_NAME='expenses' THEN
  target_id=OLD.id;
  IF TG_OP='UPDATE' AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN RETURN NEW; END IF;
 ELSE target_id=NEW.expense_id;
 END IF;
 IF EXISTS(SELECT 1 FROM payable_settlements WHERE expense_id=target_id AND status='ACTIVE') THEN
  RAISE EXCEPTION 'expense is linked to payable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER expenses_payable_guard BEFORE UPDATE OR DELETE ON expenses FOR EACH ROW EXECUTE FUNCTION protect_payable_payment_source();
CREATE TRIGGER expense_reviews_payable_guard BEFORE INSERT ON expense_accounting_reviews FOR EACH ROW EXECUTE FUNCTION protect_payable_payment_source();
