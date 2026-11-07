-- 수동 이체를 별도 수납·비용이나 가짜 은행 원본 없이 기존 이체 한 건으로 보관합니다.
-- 기존 은행 이체의 원본·금액·취소 이력은 변경하지 않습니다.
ALTER TABLE bank_transfer_postings
 ALTER COLUMN source_transaction_id DROP NOT NULL,
 ADD COLUMN manual_outgoing_account_id uuid,
 ADD COLUMN manual_date date,
 ADD COLUMN manual_amount numeric(15,0),
 ADD COLUMN manual_memo_encrypted text,
 ADD COLUMN deleted_at timestamptz,
 ADD COLUMN deleted_by uuid REFERENCES users(id),
 ADD FOREIGN KEY(property_id,manual_outgoing_account_id) REFERENCES bank_accounts(property_id,id),
 ADD CONSTRAINT manual_transfer_source_check CHECK (
  (manual_outgoing_account_id IS NULL AND source_transaction_id IS NOT NULL AND manual_date IS NULL AND manual_amount IS NULL AND manual_memo_encrypted IS NULL)
  OR (manual_outgoing_account_id IS NOT NULL AND manual_date IS NOT NULL AND manual_amount IS NOT NULL AND manual_amount>0 AND manual_outgoing_account_id<>counterpart_account_id)
 ),
 ADD CONSTRAINT manual_transfer_deletion_check CHECK (
  (deleted_at IS NULL)=(deleted_by IS NULL) AND (deleted_at IS NULL OR (manual_outgoing_account_id IS NOT NULL AND canceled_at IS NOT NULL))
 );
-- 두 은행 원본이 모두 없는 수동 이체를 허용하되 같은 원본을 양쪽에 연결할 수는 없습니다.
DO $$
DECLARE constraint_name text;
BEGIN
 FOR constraint_name IN SELECT conname FROM pg_constraint WHERE conrelid='bank_transfer_postings'::regclass
  AND contype='c' AND pg_get_constraintdef(oid) LIKE '%source_transaction_id IS DISTINCT FROM counterpart_transaction_id%'
 LOOP EXECUTE format('ALTER TABLE bank_transfer_postings DROP CONSTRAINT %I',constraint_name); END LOOP;
END $$;
ALTER TABLE bank_transfer_postings ADD CONSTRAINT transfer_distinct_sources_check
 CHECK(source_transaction_id IS NULL OR source_transaction_id IS DISTINCT FROM counterpart_transaction_id);

-- 수동 본문은 불변이며 실제 은행 원본의 최초 연결·취소·취소 뒤 삭제 감사만 허용합니다.
CREATE OR REPLACE FUNCTION guard_bank_transfer_posting() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE source bank_transactions%ROWTYPE; counterpart bank_transactions%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'transfer posting history is immutable' USING ERRCODE='23514';
 END IF;
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 IF TG_OP='UPDATE' AND (
  (to_jsonb(NEW)-'source_transaction_id'-'counterpart_transaction_id'-'canceled_at'-'canceled_by'-'deleted_at'-'deleted_by') IS DISTINCT FROM
  (to_jsonb(OLD)-'source_transaction_id'-'counterpart_transaction_id'-'canceled_at'-'canceled_by'-'deleted_at'-'deleted_by')
  OR (OLD.source_transaction_id IS NOT NULL AND NEW.source_transaction_id IS DISTINCT FROM OLD.source_transaction_id)
  OR (OLD.manual_outgoing_account_id IS NULL AND NEW.source_transaction_id IS DISTINCT FROM OLD.source_transaction_id)
  OR (OLD.deleted_at IS NOT NULL AND (NEW.deleted_at,NEW.deleted_by) IS DISTINCT FROM (OLD.deleted_at,OLD.deleted_by))
  OR (OLD.canceled_at IS NOT NULL AND ((NEW.canceled_at,NEW.canceled_by) IS DISTINCT FROM (OLD.canceled_at,OLD.canceled_by)))
  OR (OLD.counterpart_transaction_id IS NOT NULL AND NEW.counterpart_transaction_id IS DISTINCT FROM OLD.counterpart_transaction_id)
 ) THEN
  RAISE EXCEPTION 'transfer posting history is immutable' USING ERRCODE='23514';
 END IF;
 SELECT * INTO source FROM bank_transactions WHERE id=NEW.source_transaction_id AND property_id=NEW.property_id;
 IF (NEW.manual_outgoing_account_id IS NULL AND (source.id IS NULL OR NOT source.transfer_candidate OR source.bank_account_id=NEW.counterpart_account_id))
  OR (NEW.manual_outgoing_account_id IS NOT NULL AND NEW.source_transaction_id IS NOT NULL AND (source.id IS NULL OR NOT source.transfer_candidate OR source.bank_account_id<>NEW.manual_outgoing_account_id OR source.direction<>'EXPENSE' OR source.amount<>NEW.manual_amount OR source.transaction_date<>NEW.manual_date))
  OR (TG_OP='INSERT' AND source.deleted_at IS NOT NULL)
  OR EXISTS(SELECT 1 FROM payments p WHERE p.bank_transaction_id IN (NEW.source_transaction_id,NEW.counterpart_transaction_id))
  OR EXISTS(SELECT 1 FROM expenses e WHERE e.bank_transaction_id IN (NEW.source_transaction_id,NEW.counterpart_transaction_id))
  OR NOT EXISTS(SELECT 1 FROM accounting_accounts WHERE property_id=NEW.property_id AND id=NEW.accounting_account_id
   AND code='103' AND report_group='ASSET')
  OR EXISTS(SELECT 1 FROM bank_transfer_postings p WHERE p.id<>NEW.id AND
   (source.id=p.source_transaction_id OR source.id=p.counterpart_transaction_id
    OR NEW.counterpart_transaction_id=p.source_transaction_id OR NEW.counterpart_transaction_id=p.counterpart_transaction_id))
  OR EXISTS(SELECT 1 FROM bank_transfers t WHERE t.canceled_at IS NULL AND
   (source.id IN (t.outgoing_id,t.incoming_id) OR NEW.counterpart_transaction_id IN (t.outgoing_id,t.incoming_id))) THEN
  RAISE EXCEPTION 'invalid transfer posting' USING ERRCODE='23514';
 END IF;
 IF NEW.counterpart_transaction_id IS NOT NULL THEN
  SELECT * INTO counterpart FROM bank_transactions WHERE id=NEW.counterpart_transaction_id AND property_id=NEW.property_id;
  IF counterpart.id IS NULL OR NOT counterpart.transfer_candidate OR counterpart.bank_account_id<>NEW.counterpart_account_id
   OR (NEW.manual_outgoing_account_id IS NULL AND (counterpart.direction=source.direction OR counterpart.amount<>source.amount
    OR counterpart.transaction_date<>source.transaction_date))
   OR (NEW.manual_outgoing_account_id IS NOT NULL AND (counterpart.direction<>'INCOME' OR counterpart.amount<>NEW.manual_amount OR counterpart.transaction_date<>NEW.manual_date)) THEN
   RAISE EXCEPTION 'invalid transfer counterpart' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;

-- 원본 방식과 수동 방식 모두 같은 동별 귀속 테이블의 전액 합계를 검증합니다.
CREATE OR REPLACE FUNCTION validate_bank_transfer_allocation_total() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE expected numeric; actual numeric;
BEGIN
 SELECT coalesce(p.manual_amount,t.amount) INTO expected FROM bank_transfer_postings p
  LEFT JOIN bank_transactions t ON t.id=p.source_transaction_id WHERE p.id=NEW.transfer_id;
 SELECT sum(amount) INTO actual FROM bank_transfer_allocations WHERE transfer_id=NEW.transfer_id;
 IF actual IS DISTINCT FROM expected THEN
  RAISE EXCEPTION 'transfer allocation total mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;

-- 수동 이체의 동별 귀속 누락도 커밋 시 차단해 통장만 움직인 채 저장되지 않게 합니다.
CREATE FUNCTION validate_manual_transfer_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF NEW.manual_outgoing_account_id IS NOT NULL AND EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND has_buildings)
  AND (SELECT sum(amount) FROM bank_transfer_allocations WHERE transfer_id=NEW.id) IS DISTINCT FROM NEW.manual_amount THEN
  RAISE EXCEPTION 'manual transfer requires full building allocation' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER manual_transfer_allocation_required AFTER INSERT ON bank_transfer_postings
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_manual_transfer_allocation();
