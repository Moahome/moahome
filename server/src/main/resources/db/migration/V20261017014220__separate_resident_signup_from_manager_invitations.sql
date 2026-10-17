-- 주민 가입은 가입 요청에서 처리합니다. 이미 적용된 초대 스키마와 승인 이력은 보존하고
-- 완료되지 않은 주민용 코드만 철회하여 기존 코드로 권한을 받는 우회 경로를 닫습니다.
UPDATE member_invitations
 SET status='REVOKED', reviewed_by=created_by, reviewed_at=now(), revision=revision+1
 WHERE role='RESIDENT' AND status IN ('ISSUED','REQUESTED');
ALTER TABLE member_invitations ADD CONSTRAINT member_invitations_external_manager_check
 CHECK(role='MANAGER' OR status IN ('APPROVED','REVOKED'));

-- CHECK는 NULL을 허용하므로 취소 사유의 존재를 별도로 확인합니다.
-- 이미 적용된 원본 Migration은 수정하지 않고 후속 제약으로 보완합니다.
ALTER TABLE charges DROP CONSTRAINT charges_cancellation_reason_check;
ALTER TABLE charges ADD CONSTRAINT charges_cancellation_reason_check CHECK(
 (status='CANCELED' AND canceled_at IS NOT NULL AND canceled_by IS NOT NULL
  AND cancellation_reason IS NOT NULL AND cancellation_reason IN ('UNIT_DELETED','MANUAL_CANCELED','OPENING_CANCELED'))
 OR (status<>'CANCELED' AND canceled_at IS NULL AND canceled_by IS NULL AND cancellation_reason IS NULL)
);
