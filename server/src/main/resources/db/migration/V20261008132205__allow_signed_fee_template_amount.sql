-- 초기 기본 관리비에 0원과 음수를 허용합니다. 기존 항목과 금액은 보존하고 numeric(15,0)의 저장 범위는 유지합니다.
ALTER TABLE fee_template_items
    DROP CONSTRAINT fee_template_items_default_amount_check;
