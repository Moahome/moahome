-- 이미 적용된 입금자명 연결 Migration의 체크섬은 유지하고 후속 보호만 추가합니다.
-- 적용 스키마의 search_path를 고정해 다른 스키마의 연결을 중지하지 않게 합니다.
ALTER FUNCTION stop_payer_rules_for_payment() SET search_path FROM CURRENT;
ALTER FUNCTION stop_payer_rules_for_occupancy() SET search_path FROM CURRENT;

-- 등록 근거가 바뀌거나 중지 이력이 지워지면 자동 매칭의 신뢰 근거가 사라지므로 행 수정·삭제를 제한합니다.
CREATE FUNCTION protect_payer_match_rule() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payer rule history is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
   IF (to_jsonb(NEW)-ARRAY['active','stopped_by','stopped_at','stop_reason']) IS DISTINCT FROM
      (to_jsonb(OLD)-ARRAY['active','stopped_by','stopped_at','stop_reason'])
      OR (NOT OLD.active AND NEW IS DISTINCT FROM OLD) THEN
     RAISE EXCEPTION 'payer rule history is immutable' USING ERRCODE='23514';
   END IF;
   RETURN NEW;
 END IF;
 IF NOT NEW.active OR NOT EXISTS (
   SELECT 1 FROM payments p JOIN bank_transactions t ON t.id=p.bank_transaction_id AND t.property_id=p.property_id
   JOIN units u ON u.id=p.matched_unit_id AND u.property_id=p.property_id
   WHERE p.id=NEW.source_payment_id AND p.property_id=NEW.property_id
     AND p.status='CONFIRMED' AND p.receipt_type='HOUSEHOLD' AND p.deleted_at IS NULL
     AND p.auto_match_eligible AND t.deleted_at IS NULL AND u.deleted_at IS NULL AND u.status='ACTIVE'
     AND p.matched_unit_id=NEW.unit_id AND p.payer_name_hmac=NEW.payer_name_hmac
     AND p.payer_name_encrypted=NEW.payer_name_encrypted AND NEW.valid_from>=p.payment_date
 ) THEN RAISE EXCEPTION 'invalid payer rule source' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payer_match_rules_protect BEFORE INSERT OR UPDATE OR DELETE ON payer_match_rules
 FOR EACH ROW EXECUTE FUNCTION protect_payer_match_rule();
