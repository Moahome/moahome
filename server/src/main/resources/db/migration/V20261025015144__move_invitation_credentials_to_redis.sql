-- Redis 검증값이 없는 기존 미사용 코드는 재발급을 요구합니다. 이미 접수한 신청·정정·승인 출처는 보존합니다.
-- 배포 시 기존 서버를 중지한 뒤 적용합니다. 구버전과 신버전을 함께 실행하면 DB 전용 코드가 다시 발급될 수 있습니다.
UPDATE resident_join_codes
 SET status='REVOKED', revision=revision+1
 WHERE status='ISSUED';
UPDATE resident_invitations
 SET status='REVOKED', reviewed_by=created_by, reviewed_at=CURRENT_TIMESTAMP, revision=revision+1
 WHERE status='ISSUED';
UPDATE member_invitations
 SET status='REVOKED', reviewed_by=created_by, reviewed_at=CURRENT_TIMESTAMP, revision=revision+1
 WHERE status='ISSUED';

-- 재전달용 암호문은 Redis TTL로만 보관합니다. 해시는 사용 출처와 완료 재시도 식별용으로 유지합니다.
ALTER TABLE resident_invitations DROP COLUMN token_encrypted;

-- 기존 자동 명명된 1일 고정 CHECK만 찾아 제거합니다. 과거 이력의 기한은 바꾸지 않고 새 30분 발급을 허용합니다.
DO $$
DECLARE deadline_constraint record;
BEGIN
 FOR deadline_constraint IN
  SELECT conname FROM pg_constraint
   WHERE conrelid='member_invitations'::regclass AND contype='c'
     AND pg_get_constraintdef(oid) LIKE '%expires_at%'
 LOOP
  EXECUTE format('ALTER TABLE member_invitations DROP CONSTRAINT %I', deadline_constraint.conname);
 END LOOP;
END $$;
ALTER TABLE member_invitations ADD CONSTRAINT member_invitations_expiry_check
 CHECK(expires_at>created_at);
