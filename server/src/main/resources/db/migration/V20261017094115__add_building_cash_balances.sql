-- 동별 보유금은 세대 미납·선납과 분리합니다. 기존 수납의 과거 동은 추측해 소급 입력하지 않습니다.
ALTER TABLE payments ADD COLUMN cash_building_id uuid;
ALTER TABLE payments ADD CONSTRAINT payments_cash_building_fk FOREIGN KEY(property_id,cash_building_id) REFERENCES buildings(property_id,id);
CREATE TABLE building_cash_openings (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 building_id uuid NOT NULL,
 cutoff_date date NOT NULL,
 amount numeric(15,0) NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL,
 UNIQUE(property_id,building_id),
 FOREIGN KEY(property_id,building_id) REFERENCES buildings(property_id,id)
);
ALTER TABLE expense_allocations ADD CONSTRAINT expense_allocations_property_id_unique UNIQUE(property_id,id);
CREATE TABLE external_settlement_links (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 allocation_id uuid NOT NULL,
 payment_id uuid NOT NULL,
 amount numeric(15,0) NOT NULL CHECK(amount>0),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL,
 FOREIGN KEY(property_id,allocation_id) REFERENCES expense_allocations(property_id,id),
 FOREIGN KEY(property_id,payment_id) REFERENCES payments(property_id,id)
);
CREATE INDEX external_settlement_property_idx ON external_settlement_links(property_id);
CREATE FUNCTION protect_cash_balance_history() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 RAISE EXCEPTION 'cash balance history is immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER building_cash_openings_immutable BEFORE UPDATE OR DELETE ON building_cash_openings FOR EACH ROW EXECUTE FUNCTION protect_cash_balance_history();
CREATE TRIGGER external_settlement_links_immutable BEFORE UPDATE OR DELETE ON external_settlement_links FOR EACH ROW EXECUTE FUNCTION protect_cash_balance_history();
-- 확정 당시 동을 보존합니다. 수납 취소는 허용하지만 기존 귀속 동을 다른 동으로 덮어쓰지 않습니다.
CREATE FUNCTION protect_payment_cash_building() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF OLD.cash_building_id IS NOT NULL AND NEW.cash_building_id IS DISTINCT FROM OLD.cash_building_id THEN
  RAISE EXCEPTION 'payment cash building is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.cash_building_id IS NOT NULL AND (NEW.receipt_type<>'HOUSEHOLD' OR NEW.matched_unit_id IS NULL) THEN
  RAISE EXCEPTION 'invalid household cash building' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payments_cash_building_check BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION protect_payment_cash_building();
-- 원본 입금과 외부 부담액을 각각 초과 회수하지 않게 합니다. 취소된 수납의 연결은 이력만 남기고 합계에서 제외합니다.
CREATE FUNCTION validate_external_settlement_link() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE part expense_allocations%ROWTYPE; receipt payments%ROWTYPE; expense_account uuid;
BEGIN
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 SELECT * INTO part FROM expense_allocations WHERE id=NEW.allocation_id AND property_id=NEW.property_id;
 SELECT * INTO receipt FROM payments WHERE id=NEW.payment_id AND property_id=NEW.property_id;
 SELECT b.bank_account_id INTO expense_account FROM expenses e JOIN bank_transactions b ON b.id=e.bank_transaction_id WHERE e.id=part.expense_id;
 IF part.building_id IS NOT NULL OR receipt.status<>'CONFIRMED' OR receipt.receipt_type<>'OTHER' OR receipt.deleted_at IS NOT NULL
  OR receipt.bank_transaction_id IS NULL OR receipt.bank_account_id<>expense_account THEN
  RAISE EXCEPTION 'invalid external settlement source' USING ERRCODE='23514';
 END IF;
 IF (SELECT COALESCE(sum(l.amount),0) FROM external_settlement_links l JOIN payments p ON p.id=l.payment_id
     WHERE l.allocation_id=NEW.allocation_id AND p.status='CONFIRMED' AND p.deleted_at IS NULL)>part.allocated_amount
 OR (SELECT COALESCE(sum(amount),0) FROM external_settlement_links WHERE payment_id=NEW.payment_id)>receipt.amount THEN
  RAISE EXCEPTION 'external settlement exceeds source amount' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER external_settlement_amount_check AFTER INSERT ON external_settlement_links
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_external_settlement_link();
