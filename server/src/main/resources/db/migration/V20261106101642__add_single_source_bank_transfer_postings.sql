-- 103은 비용이 아니라 관리 통장 사이의 자금 이동을 구분하는 자산 계정입니다.
INSERT INTO accounting_accounts(id,property_id,name,report_group,system_key,created_by,created_at,code)
SELECT gen_random_uuid(),p.property_id,'통장간 거래','ASSET',NULL,p.created_by,now(),'103'
FROM accounting_profiles p WHERE NOT EXISTS (
 SELECT 1 FROM accounting_accounts a WHERE a.property_id=p.property_id AND a.code='103'
);

-- 자동 반영분은 실제 은행 원본으로 위장하지 않고 별도의 이체 기록으로 관리합니다.
-- 상대 원본이 들어오면 같은 이체에 한 번 연결하며 취소는 양쪽 장부 반영을 함께 제외합니다.
CREATE TABLE bank_transfer_postings (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 source_transaction_id uuid NOT NULL UNIQUE,
 counterpart_account_id uuid NOT NULL,
 counterpart_transaction_id uuid UNIQUE,
 accounting_account_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL,
 canceled_by uuid REFERENCES users(id),
 canceled_at timestamptz,
 FOREIGN KEY(property_id,source_transaction_id) REFERENCES bank_transactions(property_id,id),
 FOREIGN KEY(property_id,counterpart_account_id) REFERENCES bank_accounts(property_id,id),
 FOREIGN KEY(property_id,counterpart_transaction_id) REFERENCES bank_transactions(property_id,id),
 FOREIGN KEY(property_id,accounting_account_id) REFERENCES accounting_accounts(property_id,id),
 CHECK(source_transaction_id IS DISTINCT FROM counterpart_transaction_id),
 CHECK((canceled_at IS NULL)=(canceled_by IS NULL))
);
CREATE INDEX bank_transfer_postings_property_idx ON bank_transfer_postings(property_id);

-- 기존 이체·다른 자동 이체와의 중복 사용, 다른 대상·통장·금액의 원본 연결을 DB에서도 차단합니다.
CREATE FUNCTION guard_bank_transfer_posting() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE source bank_transactions%ROWTYPE; counterpart bank_transactions%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'transfer posting history is immutable' USING ERRCODE='23514';
 END IF;
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 IF TG_OP='UPDATE' AND (
  (to_jsonb(NEW)-'counterpart_transaction_id'-'canceled_at'-'canceled_by') IS DISTINCT FROM
  (to_jsonb(OLD)-'counterpart_transaction_id'-'canceled_at'-'canceled_by')
  OR (OLD.canceled_at IS NOT NULL AND ((NEW.canceled_at,NEW.canceled_by) IS DISTINCT FROM (OLD.canceled_at,OLD.canceled_by)))
  OR (OLD.counterpart_transaction_id IS NOT NULL AND NEW.counterpart_transaction_id IS DISTINCT FROM OLD.counterpart_transaction_id)
 ) THEN
  RAISE EXCEPTION 'transfer posting history is immutable' USING ERRCODE='23514';
 END IF;
 SELECT * INTO source FROM bank_transactions WHERE id=NEW.source_transaction_id AND property_id=NEW.property_id;
 IF source.id IS NULL OR NOT source.transfer_candidate OR source.bank_account_id=NEW.counterpart_account_id
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
   OR counterpart.direction=source.direction OR counterpart.amount<>source.amount
   OR counterpart.transaction_date<>source.transaction_date THEN
   RAISE EXCEPTION 'invalid transfer counterpart' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bank_transfer_posting_check BEFORE INSERT OR UPDATE OR DELETE ON bank_transfer_postings
 FOR EACH ROW EXECUTE FUNCTION guard_bank_transfer_posting();

-- 활성 자동 이체의 원본 삭제는 먼저 양쪽 장부 취소를 거치게 합니다. 원본 본문의 기존 불변 조건은 유지합니다.
CREATE FUNCTION guard_bank_transfer_posting_source() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND EXISTS (
  SELECT 1 FROM bank_transfer_postings p WHERE p.canceled_at IS NULL
   AND (p.source_transaction_id=OLD.id OR p.counterpart_transaction_id=OLD.id)
 ) THEN
  RAISE EXCEPTION 'cancel transfer before source deletion' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bank_transfer_posting_source_check BEFORE UPDATE ON bank_transactions
 FOR EACH ROW EXECUTE FUNCTION guard_bank_transfer_posting_source();

-- 종전 두 원본 연결 API도 자동 반영 이체의 원본을 다시 사용하지 못하게 양방향으로 보호합니다.
CREATE FUNCTION guard_legacy_transfer_posting_overlap() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 IF NEW.canceled_at IS NULL AND EXISTS (
  SELECT 1 FROM bank_transfer_postings p WHERE p.property_id=NEW.property_id
   AND (p.source_transaction_id IN (NEW.outgoing_id,NEW.incoming_id)
    OR p.counterpart_transaction_id IN (NEW.outgoing_id,NEW.incoming_id))
 ) THEN
  RAISE EXCEPTION 'transfer source already posted' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bank_transfer_posting_legacy_check BEFORE INSERT OR UPDATE ON bank_transfers
 FOR EACH ROW EXECUTE FUNCTION guard_legacy_transfer_posting_overlap();
