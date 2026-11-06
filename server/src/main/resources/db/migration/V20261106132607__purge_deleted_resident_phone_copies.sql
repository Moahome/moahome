-- 명부 삭제 또는 동의 철회 시까지라는 새 보유 기준을 이미 삭제된 주민에도 적용합니다.
-- 명부 ID·세대·계정·검토 이력은 보존하고 복호화 가능한 번호와 검색·마스킹 값을 함께 파기합니다.
UPDATE membership_requests request
SET request_phone_encrypted = NULL, request_phone_hmac = NULL, request_phone_last4 = NULL,
    phone_consent = false, phone_consent_source = NULL, phone_consent_recorded_at = NULL,
    phone_consent_recorded_by = NULL, phone_consent_notice_version = NULL
WHERE EXISTS (
    SELECT 1 FROM residents resident
    WHERE resident.deleted_at IS NOT NULL AND resident.property_id = request.property_id
      AND ((request.matched_resident_id = resident.id AND request.match_status IN ('MATCHED', 'MANUAL'))
        OR (resident.user_id IS NOT NULL AND resident.user_id = request.user_id AND request.status = 'APPROVED'))
);

UPDATE resident_invitations invitation
SET phone_encrypted = NULL, phone_hmac = NULL, phone_last4 = NULL,
    phone_consent = false, phone_consent_source = NULL, phone_consent_recorded_at = NULL,
    phone_consent_recorded_by = NULL, phone_consent_notice_version = NULL,
    status = CASE WHEN invitation.status IN ('ISSUED', 'CHANGE_REQUESTED') THEN 'REVOKED' ELSE invitation.status END
WHERE EXISTS (SELECT 1 FROM residents resident
    WHERE resident.id = invitation.resident_id AND resident.deleted_at IS NOT NULL);

-- 초기 배포 전 검증 파일의 행에는 영속 주민 ID가 없어 번호별 안전한 대조가 불가능합니다.
-- 삭제 주민이 있는 관리대상의 임시 검증을 폐기해 새 보유 기준 적용 후 과거 번호가 재유입되지 않게 합니다.
DELETE FROM resident_import_batches batch
WHERE EXISTS (SELECT 1 FROM residents resident
    WHERE resident.property_id = batch.property_id AND resident.deleted_at IS NOT NULL);

UPDATE residents
SET phone_encrypted = NULL, phone_hmac = NULL, phone_last4 = NULL,
    phone_consent = false, phone_consent_source = NULL, phone_consent_recorded_at = NULL,
    phone_consent_recorded_by = NULL, phone_consent_notice_version = NULL
WHERE deleted_at IS NOT NULL;
