-- 확정 배분은 직접 수정·삭제하지 않습니다. 후속 취소 정책 없이 이력을 덮어쓰는 경로를 차단합니다.
CREATE FUNCTION protect_confirmed_expense() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 RAISE EXCEPTION 'confirmed expense is immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER expenses_immutable BEFORE UPDATE OR DELETE ON expenses FOR EACH ROW EXECUTE FUNCTION protect_confirmed_expense();
CREATE TRIGGER expense_allocations_immutable BEFORE UPDATE OR DELETE ON expense_allocations FOR EACH ROW EXECUTE FUNCTION protect_confirmed_expense();
CREATE FUNCTION protect_expense_bank_source() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM expenses WHERE bank_transaction_id=OLD.id) AND
  (NEW.direction<>'EXPENSE' OR NEW.amount<>OLD.amount OR NEW.deleted_at IS NOT NULL) THEN
  RAISE EXCEPTION 'confirmed expense source is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER expense_bank_source_check BEFORE UPDATE ON bank_transactions FOR EACH ROW EXECUTE FUNCTION protect_expense_bank_source();
