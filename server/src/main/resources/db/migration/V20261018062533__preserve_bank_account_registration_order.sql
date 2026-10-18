-- 같은 등록 요청의 통장은 생성 시각이 같으므로 이후 요청부터 입력 순서를 명시적으로 보존합니다.
ALTER TABLE bank_accounts ADD COLUMN registration_order integer;

-- 기존 자료에는 입력 순서가 없어 생성 시각과 ID로 안정적인 순서를 부여합니다.
-- 기본 계좌 전환이나 은행명 정정에 따른 재정렬은 하지 않습니다.
WITH ordered AS (
    SELECT id, (row_number() OVER (PARTITION BY property_id ORDER BY created_at, id) - 1)::integer AS position
    FROM bank_accounts
)
UPDATE bank_accounts account
SET registration_order = ordered.position
FROM ordered
WHERE account.id = ordered.id;

-- 자료 보정으로 예약된 지연 제약 검사를 끝낸 뒤 테이블 제약을 추가합니다.
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE bank_accounts ALTER COLUMN registration_order SET NOT NULL;
ALTER TABLE bank_accounts ADD CONSTRAINT bank_accounts_registration_order_nonnegative CHECK (registration_order >= 0);
CREATE UNIQUE INDEX bank_accounts_property_registration_order_unique ON bank_accounts (property_id, registration_order);
