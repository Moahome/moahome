-- 통장 수·용도를 고정하지 않고 기존 ID·거래·수납·잔액 FK를 유지합니다.
ALTER TABLE bank_accounts ADD COLUMN account_alias varchar(100);
ALTER TABLE bank_accounts ADD CONSTRAINT bank_account_alias_check CHECK(account_alias IS NULL OR btrim(account_alias)<>'');
CREATE UNIQUE INDEX bank_accounts_active_primary_unique ON bank_accounts(property_id)
 WHERE deleted_at IS NULL AND status='ACTIVE' AND is_primary;
CREATE UNIQUE INDEX bank_accounts_number_unique ON bank_accounts(property_id,bank_code,account_number_hmac)
 WHERE deleted_at IS NULL;

-- 기본 전환의 중간 flush에서는 0개일 수 있지만 커밋 시에는 정확히 1개의 사용 중인 공용 기본 계좌를 보장합니다.
CREATE FUNCTION validate_primary_management_account() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE target uuid;
BEGIN
 target:=COALESCE(NEW.property_id,OLD.property_id);
 IF EXISTS(SELECT 1 FROM bank_accounts WHERE property_id=target AND deleted_at IS NULL) AND
  (SELECT count(*) FROM bank_accounts WHERE property_id=target AND deleted_at IS NULL AND status='ACTIVE' AND is_primary AND building_id IS NULL)<>1 THEN
  RAISE EXCEPTION 'one active primary management account required' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER bank_accounts_primary_check AFTER INSERT OR UPDATE OR DELETE ON bank_accounts
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_primary_management_account();

-- 이체 원본은 수납이나 운영 지출이 아니며 양쪽 원본·계좌별 잔액을 그대로 보존합니다.
ALTER TABLE bank_transactions ADD COLUMN transfer_candidate boolean NOT NULL DEFAULT false;
CREATE TABLE bank_transfers (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 outgoing_id uuid NOT NULL,
 incoming_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL,
 canceled_by uuid REFERENCES users(id),
 canceled_at timestamptz,
 FOREIGN KEY(property_id,outgoing_id) REFERENCES bank_transactions(property_id,id),
 FOREIGN KEY(property_id,incoming_id) REFERENCES bank_transactions(property_id,id),
 CHECK(outgoing_id<>incoming_id),
 CHECK((canceled_at IS NULL)=(canceled_by IS NULL))
);
CREATE UNIQUE INDEX bank_transfers_outgoing_unique ON bank_transfers(outgoing_id) WHERE canceled_at IS NULL;
CREATE UNIQUE INDEX bank_transfers_incoming_unique ON bank_transfers(incoming_id) WHERE canceled_at IS NULL;
CREATE INDEX bank_transfers_property_idx ON bank_transfers(property_id);

-- 서비스와 같은 관리대상 잠금으로 연결·수납·삭제를 직렬화해 서로 다른 요청의 중복 연결을 막습니다.
CREATE FUNCTION guard_bank_transfer() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE outgoing bank_transactions%ROWTYPE; incoming bank_transactions%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'transfer history is immutable' USING ERRCODE='23514'; END IF;
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-'canceled_at'-'canceled_by') IS DISTINCT FROM (to_jsonb(OLD)-'canceled_at'-'canceled_by')
   OR OLD.canceled_at IS NOT NULL OR NEW.canceled_at IS NULL OR NEW.canceled_by IS NULL THEN
   RAISE EXCEPTION 'transfer history is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO outgoing FROM bank_transactions WHERE id=NEW.outgoing_id AND property_id=NEW.property_id;
 SELECT * INTO incoming FROM bank_transactions WHERE id=NEW.incoming_id AND property_id=NEW.property_id;
 IF outgoing.id IS NULL OR incoming.id IS NULL OR outgoing.direction<>'EXPENSE' OR incoming.direction<>'INCOME'
  OR outgoing.bank_account_id=incoming.bank_account_id OR outgoing.amount<>incoming.amount
  OR NOT outgoing.transfer_candidate OR NOT incoming.transfer_candidate OR outgoing.deleted_at IS NOT NULL OR incoming.deleted_at IS NOT NULL
  OR NEW.canceled_at IS NOT NULL THEN
  RAISE EXCEPTION 'invalid internal transfer sources' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bank_transfer_check BEFORE INSERT OR UPDATE OR DELETE ON bank_transfers FOR EACH ROW EXECUTE FUNCTION guard_bank_transfer();

-- 다른 API가 이체 원본을 수납·지출로 다시 확정해 업무 합계를 이중 반영하지 못하게 합니다.
CREATE FUNCTION guard_transfer_business_classification() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF NEW.bank_transaction_id IS NOT NULL AND EXISTS(SELECT 1 FROM bank_transactions WHERE id=NEW.bank_transaction_id AND transfer_candidate) THEN
  RAISE EXCEPTION 'transfer source cannot be a receipt or expense' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payments_transfer_check BEFORE INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION guard_transfer_business_classification();
CREATE TRIGGER expenses_transfer_check BEFORE INSERT OR UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION guard_transfer_business_classification();

CREATE FUNCTION guard_transfer_source_history() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF OLD.transfer_candidate AND (NOT NEW.transfer_candidate OR NEW.bank_account_id<>OLD.bank_account_id OR NEW.property_id<>OLD.property_id
  OR NEW.amount<>OLD.amount OR NEW.direction<>OLD.direction OR NEW.transaction_date<>OLD.transaction_date) THEN
  RAISE EXCEPTION 'transfer source is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.transfer_candidate AND NOT OLD.transfer_candidate AND
  (EXISTS(SELECT 1 FROM payments WHERE bank_transaction_id=OLD.id) OR EXISTS(SELECT 1 FROM expenses WHERE bank_transaction_id=OLD.id)) THEN
  RAISE EXCEPTION 'classified source cannot become transfer' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bank_transfer_source_guard BEFORE UPDATE ON bank_transactions FOR EACH ROW EXECUTE FUNCTION guard_transfer_source_history();

-- 이체 삭제는 한 트랜잭션에서 양쪽을 함께 처리해야 하므로 flush 중간 상태는 허용하고 커밋 때 검사합니다.
CREATE FUNCTION validate_transfer_source_deletion() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM bank_transfers t JOIN bank_transactions a ON a.id=t.outgoing_id JOIN bank_transactions b ON b.id=t.incoming_id
  WHERE t.canceled_at IS NULL AND (t.outgoing_id=NEW.id OR t.incoming_id=NEW.id) AND (a.deleted_at IS NULL)<>(b.deleted_at IS NULL)) THEN
  RAISE EXCEPTION 'delete both transfer sources together' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER bank_transfer_source_deletion_check AFTER UPDATE ON bank_transactions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_transfer_source_deletion();
