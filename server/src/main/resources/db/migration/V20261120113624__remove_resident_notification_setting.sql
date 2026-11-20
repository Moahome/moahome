-- 폐기한 주민 메시지 발송 설정과 전용 제약만 제거하고 명부·연락처·수납 자료는 유지합니다.
-- 기존 Migration 이력은 유지해 이미 설정 컬럼을 적용한 DB도 같은 순서로 정리합니다.
ALTER TABLE residents DROP CONSTRAINT residents_sms_contact_check;
ALTER TABLE residents DROP COLUMN sms_enabled;
