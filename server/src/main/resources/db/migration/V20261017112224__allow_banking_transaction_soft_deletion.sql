-- 선택 삭제는 원본·확정 배분을 보존하며 삭제자·시각을 기록한 원본만 활성 집계에서 제외합니다.
CREATE OR REPLACE FUNCTION protect_expense_bank_source() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM expenses WHERE bank_transaction_id=OLD.id) AND
  (NEW.direction<>'EXPENSE' OR NEW.amount<>OLD.amount OR (NEW.deleted_at IS NOT NULL AND NEW.deleted_by IS NULL)) THEN
  RAISE EXCEPTION 'confirmed expense source is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

-- 수납을 남긴 채 은행 원본만 숨기거나 삭제 표시를 되돌려 중복 거래를 활성화하지 못하게 합니다.
CREATE FUNCTION guard_bank_transaction_deletion() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF OLD.deleted_at IS NOT NULL AND
  (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by) THEN
  RAISE EXCEPTION 'bank deletion history is immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
  PERFORM id FROM properties WHERE id=OLD.property_id FOR UPDATE;
  IF NEW.deleted_by IS NULL OR EXISTS(SELECT 1 FROM payments WHERE bank_transaction_id=OLD.id AND deleted_at IS NULL AND status<>'CANCELED') THEN
   RAISE EXCEPTION 'cancel receipts before removing bank transaction' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bank_transaction_deletion_check BEFORE UPDATE ON bank_transactions
 FOR EACH ROW EXECUTE FUNCTION guard_bank_transaction_deletion();

-- 삭제한 원본·외부 지출에는 새 수납·회수액을 연결하지 않습니다. 기존 연결 이력은 보존합니다.
CREATE FUNCTION guard_deleted_settlement_source() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM expense_allocations a JOIN expenses e ON e.id=a.expense_id
   JOIN bank_transactions b ON b.id=e.bank_transaction_id WHERE a.id=NEW.allocation_id AND b.deleted_at IS NOT NULL) THEN
  RAISE EXCEPTION 'settlement source was removed' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER external_settlement_source_check BEFORE INSERT ON external_settlement_links
 FOR EACH ROW EXECUTE FUNCTION guard_deleted_settlement_source();
