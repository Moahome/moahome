-- 사용자가 지정한 코드 체계를 기존 계정 ID에 연결합니다. 원천 금액과 분류 이력의 FK는 바꾸지 않습니다.
ALTER TABLE accounting_accounts ADD COLUMN code varchar(3);
ALTER TABLE accounting_accounts DROP CONSTRAINT accounting_accounts_report_group_check;
ALTER TABLE accounting_accounts DROP CONSTRAINT accounting_accounts_check;
ALTER TABLE accounting_accounts ADD CONSTRAINT accounting_accounts_report_group_check CHECK
 (report_group IN ('ASSET','LIABILITY','OPERATING_REVENUE','OPERATING_EXPENSE','OTHER_REVENUE','OTHER_EXPENSE'));

CREATE TEMP TABLE default_account_codes(code varchar(3),name varchar(100),report_group varchar(30),system_key varchar(40)) ON COMMIT DROP;
INSERT INTO default_account_codes VALUES
 ('101','통장','ASSET','BANK'),('102','미수금','ASSET','RECEIVABLE'),
 ('201','선수금','LIABILITY','ADVANCE_RECEIPT'),('202','미지급금','LIABILITY','PAYABLE'),
 ('401','관리비수입','OPERATING_REVENUE','MANAGEMENT_REVENUE'),
 ('801','일반관리비','OPERATING_EXPENSE',NULL),('802','청소비','OPERATING_EXPENSE',NULL),
 ('803','엘리베이터비','OPERATING_EXPENSE',NULL),('804','수도전기료','OPERATING_EXPENSE',NULL),
 ('805','모아홈비','OPERATING_EXPENSE',NULL),('806','수선비','OPERATING_EXPENSE',NULL),
 ('807','정화조비','OPERATING_EXPENSE',NULL),('808','통신비','OPERATING_EXPENSE',NULL),
 ('809','지급수수료','OPERATING_EXPENSE',NULL),('810','소모품','OPERATING_EXPENSE',NULL),
 ('811','잡비','OPERATING_EXPENSE',NULL);

-- 일회성 코드 이관 동안 계정의 표시 정보만 갱신하고 기존 ID·이력 연결은 보존합니다.
DROP TRIGGER accounting_accounts_immutable ON accounting_accounts;
UPDATE accounting_accounts a SET code=d.code,name=CASE WHEN d.system_key='MANAGEMENT_REVENUE' THEN d.name ELSE a.name END
FROM default_account_codes d WHERE a.report_group=d.report_group
 AND ((d.system_key IS NOT NULL AND a.system_key=d.system_key) OR (d.system_key IS NULL AND a.name=d.name));

-- 기존 사용자 과목은 기본 코드 다음의 빈 범위로 이관합니다. 범위를 초과하면 CHECK로 중단해 임의 합치지 않습니다.
WITH numbered AS (
 SELECT id,CASE WHEN report_group IN ('OPERATING_EXPENSE','OTHER_EXPENSE') THEN 811 ELSE 401 END
 + row_number() OVER(PARTITION BY property_id,CASE WHEN report_group IN ('OPERATING_EXPENSE','OTHER_EXPENSE') THEN 'EXPENSE' ELSE 'REVENUE' END ORDER BY created_at,id) AS assigned
 FROM accounting_accounts WHERE code IS NULL
)
UPDATE accounting_accounts a SET code=n.assigned::text FROM numbered n WHERE a.id=n.id;

INSERT INTO accounting_accounts(id,property_id,name,report_group,system_key,created_by,created_at,code)
SELECT gen_random_uuid(),p.property_id,d.name,d.report_group,d.system_key,p.created_by,now(),d.code
FROM accounting_profiles p CROSS JOIN default_account_codes d
WHERE NOT EXISTS(SELECT 1 FROM accounting_accounts a WHERE a.property_id=p.property_id AND a.code=d.code);

ALTER TABLE accounting_accounts ALTER COLUMN code SET NOT NULL;
ALTER TABLE accounting_accounts ADD CONSTRAINT accounting_accounts_code_unique UNIQUE(property_id,code);
ALTER TABLE accounting_accounts ADD CONSTRAINT accounting_accounts_code_type_check CHECK
 (code ~ '^[1248][0-9]{2}$' AND
 ((report_group='ASSET' AND code LIKE '1%') OR (report_group='LIABILITY' AND code LIKE '2%') OR
 (report_group IN ('OPERATING_REVENUE','OTHER_REVENUE') AND code LIKE '4%') OR
 (report_group IN ('OPERATING_EXPENSE','OTHER_EXPENSE') AND code LIKE '8%')));
ALTER TABLE accounting_accounts ADD CONSTRAINT accounting_accounts_system_key_check CHECK
 (system_key IS NULL OR (system_key='BANK' AND code='101' AND report_group='ASSET') OR
 (system_key='RECEIVABLE' AND code='102' AND report_group='ASSET') OR
 (system_key='ADVANCE_RECEIPT' AND code='201' AND report_group='LIABILITY') OR
 (system_key='PAYABLE' AND code='202' AND report_group='LIABILITY') OR
 (system_key='MANAGEMENT_REVENUE' AND code='401' AND report_group='OPERATING_REVENUE'));
CREATE TRIGGER accounting_accounts_immutable BEFORE UPDATE OR DELETE ON accounting_accounts
 FOR EACH ROW EXECUTE FUNCTION protect_income_statement_history();

-- 일반관리비의 계정 연결은 이번 사용자 지정에 따라 확정합니다. 수납·부과 금액과 원래 항목 ID는 보존합니다.
UPDATE fee_template_items f SET revenue_account_id=a.id
FROM accounting_accounts a WHERE a.property_id=f.property_id AND a.system_key='MANAGEMENT_REVENUE'
 AND f.item_code='GENERAL_MANAGEMENT' AND f.revenue_account_id IS NULL;
UPDATE charge_items ci SET revenue_account_id=a.id
FROM accounting_accounts a WHERE a.property_id=ci.property_id AND a.system_key='MANAGEMENT_REVENUE'
 AND ci.item_code='GENERAL_MANAGEMENT' AND ci.revenue_account_id IS NULL;
