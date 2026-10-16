-- 기존 수납은 세대 납부로 유지하고 기타 입금은 같은 은행 원본의 별도 분류로 관리합니다.
ALTER TABLE payments
 ADD COLUMN receipt_type varchar(20) NOT NULL DEFAULT 'HOUSEHOLD',
 ADD COLUMN income_category_encrypted text,
 ADD COLUMN income_note_encrypted text;

-- 초기 Migration의 자동 생성된 세대 필수 CHECK를 찾아 교체합니다. 스키마마다 이름을 가정하지 않습니다.
DO $$
DECLARE constraint_name text;
BEGIN
 SELECT conname INTO STRICT constraint_name FROM pg_constraint
 WHERE conrelid='payments'::regclass AND contype='c'
 AND pg_get_constraintdef(oid) LIKE '%matched_unit_id%';
 EXECUTE format('ALTER TABLE payments DROP CONSTRAINT %I',constraint_name);
END $$;

ALTER TABLE payments
 ADD CONSTRAINT payments_receipt_type_check CHECK(receipt_type IN ('HOUSEHOLD','OTHER')),
 ADD CONSTRAINT payments_receipt_shape_check CHECK(
  (receipt_type='HOUSEHOLD' AND income_category_encrypted IS NULL AND income_note_encrypted IS NULL
   AND (status NOT IN ('CONFIRMED','CANCELED') OR matched_unit_id IS NOT NULL))
  OR (receipt_type='OTHER' AND source_type='BANK_IMPORT' AND status IN ('CONFIRMED','CANCELED')
      AND matched_unit_id IS NULL AND payer_resident_id IS NULL AND income_category_encrypted IS NOT NULL)
 );

-- NULL 세대 비교가 검증을 우회하지 않도록 기타 입금의 청구 배분을 명시적으로 차단합니다.
CREATE OR REPLACE FUNCTION validate_payment_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p payments%ROWTYPE; c charges%ROWTYPE;
BEGIN
 SELECT * INTO p FROM payments WHERE id=NEW.payment_id;
 SELECT * INTO c FROM charges WHERE id=NEW.charge_id;
 IF NEW.status='ACTIVE' AND (p.status <> 'CONFIRMED' OR p.receipt_type <> 'HOUSEHOLD'
     OR c.status <> 'ISSUED' OR c.total_amount <= 0 OR p.matched_unit_id IS DISTINCT FROM c.unit_id) THEN
   RAISE EXCEPTION 'Invalid payment allocation' USING ERRCODE='23514';
 END IF;
 IF (SELECT coalesce(sum(allocated_amount),0) FROM payment_allocations WHERE payment_id=p.id AND status='ACTIVE') > p.amount
 OR (SELECT coalesce(sum(allocated_amount),0) FROM payment_allocations WHERE charge_id=c.id AND status='ACTIVE') > c.total_amount THEN
   RAISE EXCEPTION 'Payment allocation exceeds balance' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;

-- 세대 납부를 직접 SQL로 기타 입금으로 바꿔도 이미 존재하는 활성 배분을 숨길 수 없습니다.
CREATE FUNCTION protect_other_income_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.receipt_type='OTHER' AND EXISTS(SELECT 1 FROM payment_allocations WHERE payment_id=NEW.id AND status='ACTIVE') THEN
  RAISE EXCEPTION 'Other income cannot have active allocations' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER other_income_allocation_guard BEFORE UPDATE OF receipt_type ON payments
 FOR EACH ROW EXECUTE FUNCTION protect_other_income_allocation();
