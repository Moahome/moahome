-- 기타 입금은 사용자 지정 901 영업외수익에 연결합니다. 기존 계정 ID·회수 연결·금액은 보존합니다.
ALTER TABLE accounting_accounts DROP CONSTRAINT accounting_accounts_code_type_check;
ALTER TABLE accounting_accounts ADD CONSTRAINT accounting_accounts_code_type_check CHECK
 (code ~ '^[12489][0-9]{2}$' AND
 ((report_group='ASSET' AND code LIKE '1%') OR (report_group='LIABILITY' AND code LIKE '2%') OR
 (report_group='OPERATING_REVENUE' AND code LIKE '4%') OR
 (report_group='OTHER_REVENUE' AND (code LIKE '4%' OR code LIKE '9%')) OR
 (report_group IN ('OPERATING_EXPENSE','OTHER_EXPENSE') AND code LIKE '8%')));

ALTER TABLE accounting_accounts DROP CONSTRAINT accounting_accounts_system_key_check;
ALTER TABLE accounting_accounts ADD CONSTRAINT accounting_accounts_system_key_check CHECK
 (system_key IS NULL OR (system_key='BANK' AND code='101' AND report_group='ASSET') OR
 (system_key='RECEIVABLE' AND code='102' AND report_group='ASSET') OR
 (system_key='ADVANCE_RECEIPT' AND code='201' AND report_group='LIABILITY') OR
 (system_key='PAYABLE' AND code='202' AND report_group='LIABILITY') OR
 (system_key='MANAGEMENT_REVENUE' AND code='401' AND report_group='OPERATING_REVENUE') OR
 (system_key='OTHER_INCOME' AND code='901' AND report_group='OTHER_REVENUE'));

INSERT INTO accounting_accounts(id,property_id,name,report_group,system_key,created_by,created_at,code)
SELECT gen_random_uuid(),p.property_id,'영업외수익','OTHER_REVENUE','OTHER_INCOME',p.created_by,now(),'901'
FROM accounting_profiles p;
