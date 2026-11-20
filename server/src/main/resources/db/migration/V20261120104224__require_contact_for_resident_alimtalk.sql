-- 연락처 없는 기존 명부의 발송 설정을 끄고 열린 화면의 조회 버전도 갱신합니다.
-- 연락처가 있는 주민의 기존 ON/OFF 선택은 그대로 보존합니다.
UPDATE residents
SET alimtalk_enabled = false, updated_at = CURRENT_TIMESTAMP
WHERE phone_encrypted IS NULL AND alimtalk_enabled = true;

-- 직접 삽입도 연락처 없는 ON을 만들지 못하게 하며, 연락처 있는 신규 주민의 기본 ON은 등록 로직이 지정합니다.
ALTER TABLE residents ALTER COLUMN alimtalk_enabled SET DEFAULT false;
ALTER TABLE residents ADD CONSTRAINT residents_alimtalk_contact_check
    CHECK (phone_encrypted IS NOT NULL OR alimtalk_enabled = false);
