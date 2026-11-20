-- 기존 주민별 ON/OFF 선택과 연락처 제약을 보존한 채 문자 발송 설정으로 이름을 맞춥니다.
-- 이미 적용된 알림톡 Migration은 그대로 두어 기존 DB에서도 순차 이관할 수 있게 합니다.
ALTER TABLE residents RENAME COLUMN alimtalk_enabled TO sms_enabled;
ALTER TABLE residents RENAME CONSTRAINT residents_alimtalk_contact_check TO residents_sms_contact_check;
