-- 통장 월중 마감 이후 거래를 같은 달 관리비에 반영할 수 있도록 월 단위 시작 제약을 확장합니다.
-- 기존 청구·잔액·운영 시작일은 보정하지 않으며 정정 기한만 최초 첫 부과월 말일로 고정합니다.
ALTER TABLE properties ADD COLUMN initial_correction_deadline date;
UPDATE properties SET initial_correction_deadline =
 (first_billing_month + INTERVAL '1 month - 1 day')::date
 WHERE first_billing_month IS NOT NULL;
ALTER TABLE properties DROP CONSTRAINT properties_management_start_check;
ALTER TABLE properties ADD CONSTRAINT properties_management_start_check CHECK (
 (management_started_at IS NULL AND first_billing_month IS NULL AND balance_cutoff_date IS NULL)
 OR (management_started_at IS NOT NULL AND first_billing_month IS NOT NULL
  AND EXTRACT(day FROM first_billing_month)=1
  AND (balance_cutoff_date IS NULL OR first_billing_month >= date_trunc('month',balance_cutoff_date + 1)::date))
);
-- 이전 CHECK은 자동 이름이므로 정의로 찾아 교체하고 다른 상태·감사 제약은 유지합니다.
DO $$
DECLARE c record;
BEGIN
 FOR c IN SELECT conname FROM pg_constraint
  WHERE conrelid='opening_balance_batches'::regclass AND contype='c'
   AND pg_get_constraintdef(oid) LIKE '%first_billing_month%' LOOP
  EXECUTE format('ALTER TABLE opening_balance_batches DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE opening_balance_batches ADD CONSTRAINT opening_balance_start_month_check
 CHECK(EXTRACT(day FROM first_billing_month)=1
  AND first_billing_month >= date_trunc('month',cutoff_date + 1)::date);
-- 시작월을 옮겨도 정정 기한이 연장되거나 잠금이 다시 열리지 않게 DB에서도 원래 값을 보존합니다.
CREATE FUNCTION preserve_initial_correction_deadline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.initial_correction_deadline IS NOT NULL
  AND NEW.initial_correction_deadline IS DISTINCT FROM OLD.initial_correction_deadline THEN
  RAISE EXCEPTION 'Initial correction deadline is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER properties_initial_deadline_immutable BEFORE UPDATE ON properties
 FOR EACH ROW EXECUTE FUNCTION preserve_initial_correction_deadline();
