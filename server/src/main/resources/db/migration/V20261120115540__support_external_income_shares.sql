-- 혼합 입금의 외부 몫은 실제 동을 생성하지 않고 배분 표시명으로 보존합니다.
ALTER TABLE income_allocations ALTER COLUMN building_id DROP NOT NULL;
ALTER TABLE income_allocations ADD CONSTRAINT income_allocations_source_key UNIQUE(property_id,payment_id,id);
ALTER TABLE external_settlement_links ADD COLUMN income_allocation_id uuid;
ALTER TABLE external_settlement_links ADD CONSTRAINT external_settlement_income_share_fk
 FOREIGN KEY(property_id,payment_id,income_allocation_id) REFERENCES income_allocations(property_id,payment_id,id);

-- 기존 입금 연결을 재사용하되 배분한 입금에서는 지정한 외부 몫만 사용할 수 있습니다.
-- 같은 관리대상 잠금 아래 지출·입금·개별 외부 몫의 활성 사용 합계를 검증합니다.
CREATE OR REPLACE FUNCTION validate_external_settlement_link() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE part expense_allocations%ROWTYPE; receipt payments%ROWTYPE; outgoing expenses%ROWTYPE; incoming income_allocations%ROWTYPE;
BEGIN
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 SELECT * INTO part FROM expense_allocations WHERE id=NEW.allocation_id AND property_id=NEW.property_id;
 SELECT * INTO receipt FROM payments WHERE id=NEW.payment_id AND property_id=NEW.property_id;
 SELECT * INTO outgoing FROM expenses WHERE id=part.expense_id AND property_id=NEW.property_id;
 IF part.id IS NULL OR receipt.id IS NULL OR outgoing.id IS NULL OR outgoing.deleted_at IS NOT NULL
  OR part.building_id IS NOT NULL OR receipt.status<>'CONFIRMED' OR receipt.receipt_type<>'OTHER' OR receipt.deleted_at IS NOT NULL
  OR receipt.bank_account_id<>outgoing.bank_account_id
  OR (receipt.bank_transaction_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bank_transactions b WHERE b.id=receipt.bank_transaction_id AND b.deleted_at IS NULL AND b.direction='INCOME')) THEN
  RAISE EXCEPTION 'invalid external settlement source' USING ERRCODE='23514';
 END IF;
 IF NEW.income_allocation_id IS NULL THEN
  IF EXISTS(SELECT 1 FROM income_allocations WHERE payment_id=receipt.id)
   OR (receipt.bank_transaction_id IS NULL AND NOT (receipt.source_type='MANUAL' AND receipt.manual_purpose='OTHER')) THEN
   RAISE EXCEPTION 'distributed income requires external share' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT * INTO incoming FROM income_allocations WHERE id=NEW.income_allocation_id AND property_id=NEW.property_id AND payment_id=receipt.id;
  IF incoming.id IS NULL OR incoming.building_id IS NOT NULL THEN
   RAISE EXCEPTION 'external income share required' USING ERRCODE='23514';
  END IF;
 END IF;
 IF (SELECT COALESCE(sum(l.amount),0) FROM external_settlement_links l JOIN payments p ON p.id=l.payment_id
     WHERE l.allocation_id=NEW.allocation_id AND p.status='CONFIRMED' AND p.deleted_at IS NULL)>part.allocated_amount
 OR (SELECT COALESCE(sum(l.amount),0) FROM external_settlement_links l JOIN expense_allocations a ON a.id=l.allocation_id
     JOIN expenses e ON e.id=a.expense_id LEFT JOIN bank_transactions b ON b.id=e.bank_transaction_id
     WHERE l.payment_id=NEW.payment_id AND e.deleted_at IS NULL AND (e.source_type='MANUAL' OR b.deleted_at IS NULL))>receipt.amount
 OR (NEW.income_allocation_id IS NOT NULL AND
     (SELECT COALESCE(sum(l.amount),0) FROM external_settlement_links l JOIN expense_allocations a ON a.id=l.allocation_id
      JOIN expenses e ON e.id=a.expense_id LEFT JOIN bank_transactions b ON b.id=e.bank_transaction_id
      WHERE l.income_allocation_id=NEW.income_allocation_id AND e.deleted_at IS NULL AND (e.source_type='MANUAL' OR b.deleted_at IS NULL))>incoming.amount) THEN
  RAISE EXCEPTION 'external settlement exceeds source amount' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;

-- 출금 삭제 뒤에는 같은 보관금을 다시 연결할 수 있으며 삭제·사용 이력은 남깁니다.
CREATE OR REPLACE FUNCTION guard_deleted_settlement_source() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 IF (NEW.income_allocation_id IS NULL AND EXISTS(SELECT 1 FROM income_allocations WHERE payment_id=NEW.payment_id))
  OR EXISTS(SELECT 1 FROM expense_allocations a JOIN expenses e ON e.id=a.expense_id
   JOIN bank_transactions b ON b.id=e.bank_transaction_id WHERE a.id=NEW.allocation_id AND b.deleted_at IS NOT NULL) THEN
  RAISE EXCEPTION 'settlement source unavailable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

-- 입금·지출은 같은 비율 절사 규칙을 사용합니다. 한 곳에 명시한 잔액 전액만 허용합니다.
CREATE OR REPLACE FUNCTION validate_income_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE receipt payments%ROWTYPE; total numeric; ratios numeric; mode_count integer; mode text;
 base_total numeric; remainder_amount numeric; adjusted_count integer;
BEGIN
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 SELECT * INTO receipt FROM payments WHERE id=NEW.payment_id AND property_id=NEW.property_id;
 IF receipt.status NOT IN ('CONFIRMED','OPENING') OR receipt.receipt_type<>'OTHER' OR receipt.deleted_at IS NOT NULL
  OR NOT ((receipt.bank_transaction_id IS NULL AND receipt.source_type='MANUAL' AND receipt.manual_purpose='SHARED')
   OR EXISTS(SELECT 1 FROM bank_transactions WHERE id=receipt.bank_transaction_id AND direction='INCOME' AND deleted_at IS NULL AND amount=receipt.amount))
  OR EXISTS(SELECT 1 FROM external_settlement_links WHERE payment_id=receipt.id) THEN
  RAISE EXCEPTION 'invalid distributed income source' USING ERRCODE='23514';
 END IF;
 SELECT sum(amount),sum(percentage),count(DISTINCT allocation_mode),min(allocation_mode) INTO total,ratios,mode_count,mode
  FROM income_allocations WHERE payment_id=NEW.payment_id;
 IF total<>receipt.amount OR mode_count<>1 OR (mode='RATIO' AND COALESCE(ratios,0)<>100)
  OR EXISTS(SELECT 1 FROM income_allocations WHERE payment_id=NEW.payment_id AND
   ((mode='RATIO' AND percentage IS NULL) OR (mode<>'RATIO' AND percentage IS NOT NULL)
    OR (mode='EQUAL' AND amount<>receipt.amount/(SELECT count(*) FROM income_allocations WHERE payment_id=NEW.payment_id)))) THEN
  RAISE EXCEPTION 'invalid distributed income sum' USING ERRCODE='23514';
 END IF;
 IF mode='RATIO' THEN
  SELECT sum(trunc(receipt.amount*percentage/100)), count(*) FILTER(WHERE amount<>trunc(receipt.amount*percentage/100))
   INTO base_total,adjusted_count FROM income_allocations WHERE payment_id=NEW.payment_id;
  remainder_amount=receipt.amount-base_total;
  IF (remainder_amount=0 AND adjusted_count<>0) OR (remainder_amount>0 AND adjusted_count<>1)
   OR EXISTS(SELECT 1 FROM income_allocations WHERE payment_id=NEW.payment_id AND amount NOT IN
    (trunc(receipt.amount*percentage/100),trunc(receipt.amount*percentage/100)+remainder_amount)) THEN
   RAISE EXCEPTION 'invalid income ratio remainder' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NULL;
END $$;
