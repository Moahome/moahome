-- 후속 사용자 요청: 이미 세대 연결을 확정한 과거 은행 입금은 해당 세대의 동으로 자동 귀속합니다.
-- 기존 귀속 동은 보존하고, 기타 입금·미확정·은행 원본 없는 수납은 대상에서 제외합니다.
UPDATE payments p SET cash_building_id=u.building_id
 FROM units u JOIN buildings g ON g.id=u.building_id AND g.property_id=u.property_id,
      bank_transactions b
 WHERE p.cash_building_id IS NULL AND p.status='CONFIRMED' AND p.receipt_type='HOUSEHOLD'
   AND p.deleted_at IS NULL AND p.matched_unit_id=u.id AND p.property_id=u.property_id
   AND p.bank_transaction_id=b.id AND p.property_id=b.property_id AND p.bank_account_id=b.bank_account_id
   AND b.direction='INCOME' AND b.deleted_at IS NULL;

-- 이후 확정·이관되는 같은 종류의 수납도 최초 연결 동을 저장합니다. 읽기에서 현재 동을 매번 다시 계산하지 않습니다.
CREATE FUNCTION populate_payment_cash_building() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF NEW.cash_building_id IS NOT NULL OR NEW.status<>'CONFIRMED' OR NEW.receipt_type<>'HOUSEHOLD'
    OR NEW.deleted_at IS NOT NULL OR NEW.bank_transaction_id IS NULL OR NEW.matched_unit_id IS NULL THEN
  RETURN NEW;
 END IF;
 SELECT u.building_id INTO NEW.cash_building_id
  FROM units u JOIN buildings g ON g.id=u.building_id AND g.property_id=u.property_id
  JOIN bank_transactions b ON b.id=NEW.bank_transaction_id AND b.property_id=NEW.property_id
  WHERE u.id=NEW.matched_unit_id AND u.property_id=NEW.property_id
    AND b.bank_account_id=NEW.bank_account_id AND b.direction='INCOME' AND b.deleted_at IS NULL;
 RETURN NEW;
END $$;
CREATE TRIGGER payments_cash_building_fill BEFORE INSERT OR UPDATE ON payments
 FOR EACH ROW EXECUTE FUNCTION populate_payment_cash_building();
