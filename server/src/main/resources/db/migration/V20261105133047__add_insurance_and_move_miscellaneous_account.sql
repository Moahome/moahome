-- 보험료 812·잡비 813을 사용자 지정으로 반영합니다. 기존 계정 ID와 원천 매칭 이력은 보존합니다.
DROP TRIGGER accounting_accounts_immutable ON accounting_accounts;

-- 종전에 자동 배정한 사용자 과목이 새 기본 코드와 충돌하면 빈 추가 코드로 이동합니다.
-- 계정 ID를 유지하므로 청구·과목 매칭 이력의 FK와 금액은 달라지지 않습니다.
DO $$
DECLARE entry record; next_code varchar(3);
BEGIN
 FOR entry IN SELECT id,property_id FROM accounting_accounts
  WHERE code IN ('812','813') AND NOT
   (report_group='OPERATING_EXPENSE' AND
    ((code='812' AND name='보험료') OR (code='813' AND name='잡비')))
  ORDER BY property_id,code,id
 LOOP
  SELECT candidate::text INTO next_code FROM generate_series(814,899) candidate
   WHERE NOT EXISTS (SELECT 1 FROM accounting_accounts a
    WHERE a.property_id=entry.property_id AND a.code=candidate::text)
   ORDER BY candidate LIMIT 1;
  IF next_code IS NULL THEN
   RAISE EXCEPTION 'expense account code range exhausted' USING ERRCODE='23514';
  END IF;
  UPDATE accounting_accounts SET code=next_code WHERE id=entry.id;
 END LOOP;
END $$;

UPDATE accounting_accounts SET code='813' WHERE report_group='OPERATING_EXPENSE' AND name='잡비';
UPDATE accounting_accounts SET code='812' WHERE report_group='OPERATING_EXPENSE' AND name='보험료';
INSERT INTO accounting_accounts(id,property_id,name,report_group,created_by,created_at,code)
SELECT gen_random_uuid(),p.property_id,'보험료','OPERATING_EXPENSE',p.created_by,now(),'812'
FROM accounting_profiles p WHERE NOT EXISTS
 (SELECT 1 FROM accounting_accounts a WHERE a.property_id=p.property_id AND a.code='812');

CREATE TRIGGER accounting_accounts_immutable BEFORE UPDATE OR DELETE ON accounting_accounts
 FOR EACH ROW EXECUTE FUNCTION protect_income_statement_history();
