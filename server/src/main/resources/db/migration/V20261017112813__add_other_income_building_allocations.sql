-- 이자 등 기타 입금의 전액을 동별로 귀속합니다. 은행 원본·수납 금액은 복제하지 않습니다.
CREATE TABLE income_allocations (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 payment_id uuid NOT NULL,
 building_id uuid NOT NULL,
 building_label_encrypted text NOT NULL,
 amount numeric(15,0) NOT NULL CHECK(amount>0),
 percentage numeric(5,2) CHECK(percentage>0 AND percentage<=100),
 allocation_mode varchar(20) NOT NULL CHECK(allocation_mode IN ('EQUAL','RATIO','AMOUNT')),
 sort_order integer NOT NULL CHECK(sort_order>=0),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL,
 FOREIGN KEY(property_id,payment_id) REFERENCES payments(property_id,id),
 FOREIGN KEY(property_id,building_id) REFERENCES buildings(property_id,id),
 UNIQUE(payment_id,building_id), UNIQUE(payment_id,sort_order)
);
CREATE INDEX income_allocations_property_idx ON income_allocations(property_id);
CREATE TRIGGER income_allocations_immutable BEFORE UPDATE OR DELETE ON income_allocations
 FOR EACH ROW EXECUTE FUNCTION protect_cash_balance_history();

-- 배분 합계·비율·원본의 유효성을 커밋 직전에 검증합니다. 동별 보유금과 외부 회수의 이중 집계를 막습니다.
CREATE FUNCTION validate_income_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE receipt payments%ROWTYPE; total numeric; ratios numeric; mode_count integer; mode text;
BEGIN
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 SELECT * INTO receipt FROM payments WHERE id=NEW.payment_id AND property_id=NEW.property_id;
 IF receipt.status<>'CONFIRMED' OR receipt.receipt_type<>'OTHER' OR receipt.deleted_at IS NOT NULL
  OR NOT EXISTS(SELECT 1 FROM bank_transactions WHERE id=receipt.bank_transaction_id AND direction='INCOME' AND deleted_at IS NULL AND amount=receipt.amount)
  OR EXISTS(SELECT 1 FROM external_settlement_links WHERE payment_id=receipt.id) THEN
  RAISE EXCEPTION 'invalid distributed income source' USING ERRCODE='23514';
 END IF;
 SELECT sum(amount),sum(percentage),count(DISTINCT allocation_mode),min(allocation_mode) INTO total,ratios,mode_count,mode
  FROM income_allocations WHERE payment_id=NEW.payment_id;
 IF total<>receipt.amount OR mode_count<>1 OR (mode='RATIO' AND COALESCE(ratios,0)<>100)
  OR EXISTS(SELECT 1 FROM income_allocations WHERE payment_id=NEW.payment_id AND
   ((mode='RATIO' AND (percentage IS NULL OR amount<>receipt.amount*percentage/100))
    OR (mode<>'RATIO' AND percentage IS NOT NULL)
    OR (mode='EQUAL' AND amount<>receipt.amount/(SELECT count(*) FROM income_allocations WHERE payment_id=NEW.payment_id)))) THEN
  RAISE EXCEPTION 'invalid distributed income sum' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER income_allocation_amount_check AFTER INSERT ON income_allocations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_income_allocation();

CREATE OR REPLACE FUNCTION guard_deleted_settlement_source() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM income_allocations WHERE payment_id=NEW.payment_id)
  OR EXISTS(SELECT 1 FROM expense_allocations a JOIN expenses e ON e.id=a.expense_id
   JOIN bank_transactions b ON b.id=e.bank_transaction_id WHERE a.id=NEW.allocation_id AND b.deleted_at IS NOT NULL) THEN
  RAISE EXCEPTION 'settlement source unavailable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
