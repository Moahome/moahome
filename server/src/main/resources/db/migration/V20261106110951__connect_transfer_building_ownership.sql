-- 이체 한 건의 동별 금액을 원본으로 보관하고 양쪽 통장의 같은 동 보유금에 반대 방향으로 투영합니다.
-- 기존 귀속 미확인 이체는 임의로 나누지 않으며 관리자가 전액을 확인할 때 이 기록을 추가합니다.
ALTER TABLE bank_transfer_postings ADD CONSTRAINT bank_transfer_postings_property_id_key UNIQUE(property_id,id);
CREATE TABLE bank_transfer_allocations (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 transfer_id uuid NOT NULL,
 building_id uuid NOT NULL,
 amount numeric(15,0) NOT NULL CHECK(amount>0),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL,
 FOREIGN KEY(property_id,transfer_id) REFERENCES bank_transfer_postings(property_id,id),
 FOREIGN KEY(property_id,building_id) REFERENCES buildings(property_id,id),
 UNIQUE(transfer_id,building_id)
);
CREATE INDEX bank_transfer_allocations_property_idx ON bank_transfer_allocations(property_id);

-- 귀속 원문은 변경·삭제하지 않고 상위 이체 취소 여부로 양쪽 보유금 반영을 함께 제외합니다.
CREATE FUNCTION guard_bank_transfer_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN
  RAISE EXCEPTION 'transfer allocation history is immutable' USING ERRCODE='23514';
 END IF;
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM bank_transfer_postings p WHERE p.id=NEW.transfer_id AND p.property_id=NEW.property_id AND p.canceled_at IS NULL) THEN
  RAISE EXCEPTION 'transfer allocation requires active posting' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bank_transfer_allocation_guard BEFORE INSERT OR UPDATE OR DELETE ON bank_transfer_allocations
 FOR EACH ROW EXECUTE FUNCTION guard_bank_transfer_allocation();

-- 행별 flush 중에는 부분 합계를 허용하되 커밋 시에는 한 이체의 전액 귀속만 확정합니다.
CREATE FUNCTION validate_bank_transfer_allocation_total() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE expected numeric; actual numeric;
BEGIN
 SELECT t.amount INTO expected FROM bank_transfer_postings p JOIN bank_transactions t ON t.id=p.source_transaction_id WHERE p.id=NEW.transfer_id;
 SELECT sum(amount) INTO actual FROM bank_transfer_allocations WHERE transfer_id=NEW.transfer_id;
 IF actual IS DISTINCT FROM expected THEN
  RAISE EXCEPTION 'transfer allocation total mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER bank_transfer_allocation_total AFTER INSERT ON bank_transfer_allocations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_bank_transfer_allocation_total();
