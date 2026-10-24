-- 운영 중 확인값은 인계·거래·동별 계산과 분리하고 실제 확인시점과 기록시점을 보존합니다.
CREATE TABLE bank_balance_checks (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 bank_account_id uuid NOT NULL,
 balance_amount numeric(15,0) NOT NULL CHECK (balance_amount >= 0),
 checked_at timestamptz NOT NULL,
 source_type varchar(30) NOT NULL CHECK (source_type IN ('BANK_APP','INTERNET_BANKING','OTHER')),
 checked_by uuid NOT NULL REFERENCES users(id),
 memo_encrypted text,
 created_at timestamptz NOT NULL,
 canceled_at timestamptz,
 canceled_by uuid REFERENCES users(id),
 cancel_request_id uuid UNIQUE,
 cancel_reason_encrypted text,
 FOREIGN KEY (property_id, bank_account_id) REFERENCES bank_accounts(property_id,id),
 CHECK (checked_at <= created_at),
 CHECK ((canceled_at IS NULL AND canceled_by IS NULL AND cancel_request_id IS NULL AND cancel_reason_encrypted IS NULL)
     OR (canceled_at IS NOT NULL AND canceled_by IS NOT NULL AND cancel_request_id IS NOT NULL AND cancel_reason_encrypted IS NOT NULL AND canceled_at >= created_at))
);
CREATE INDEX bank_balance_checks_account_time_idx ON bank_balance_checks(property_id,bank_account_id,checked_at DESC,created_at DESC);
-- 원문을 보존하고 최초 취소 감사만 허용해 재시도·동시 변경으로 이력이 되돌아가지 않게 합니다.
CREATE FUNCTION protect_bank_balance_check() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'bank balance check history is immutable' USING ERRCODE='23514'; END IF;
 IF ROW(NEW.id,NEW.property_id,NEW.bank_account_id,NEW.balance_amount,NEW.checked_at,NEW.source_type,NEW.checked_by,NEW.memo_encrypted,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.property_id,OLD.bank_account_id,OLD.balance_amount,OLD.checked_at,OLD.source_type,OLD.checked_by,OLD.memo_encrypted,OLD.created_at)
    OR OLD.canceled_at IS NOT NULL OR NEW.canceled_at IS NULL THEN
  RAISE EXCEPTION 'bank balance check history is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bank_balance_check_history_guard BEFORE UPDATE OR DELETE ON bank_balance_checks
 FOR EACH ROW EXECUTE FUNCTION protect_bank_balance_check();
