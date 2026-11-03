-- 초기 수기 입금은 은행 원본을 만들지 않습니다. 기준일까지 입금만 OPENING으로 보존해 이중 충당을 막습니다.
CREATE OR REPLACE FUNCTION validate_opening_payment() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.status='OPENING' AND NEW.status<>'OPENING' THEN
  RAISE EXCEPTION 'opening payment state is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.status='OPENING' AND (NEW.source_type NOT IN ('BANK_IMPORT','MANUAL')
  OR (NEW.source_type='BANK_IMPORT' AND NEW.bank_transaction_id IS NULL)
  OR NOT EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND balance_cutoff_date>=NEW.payment_date)
  OR EXISTS(SELECT 1 FROM payment_allocations WHERE payment_id=NEW.id AND status='ACTIVE')) THEN
  RAISE EXCEPTION 'invalid opening payment' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

-- 검토 중 추가했던 납부 확인 전용 표는 수기 입출금 입력으로 대체합니다.
-- 저장된 확인 이력이 있는 환경은 자동 삭제하지 않고 별도 인계 검토를 요구합니다.
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM opening_payment_snapshots) THEN
  RAISE EXCEPTION 'opening payment snapshots require a reviewed migration before removal';
 END IF;
END $$;
DROP TABLE opening_payment_snapshots;
DROP FUNCTION validate_opening_payment_snapshot();
