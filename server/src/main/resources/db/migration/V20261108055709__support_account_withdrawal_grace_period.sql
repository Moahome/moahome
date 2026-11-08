-- 개인정보를 보관하는 30일 유예 상태를 추가하고 기존 확정 탈퇴 행은 복구하지 않습니다.
ALTER TABLE users ADD COLUMN withdrawal_requested_at timestamptz;
ALTER TABLE users ADD COLUMN withdrawal_expires_at timestamptz;
-- 복구 후에도 신청 이전 모든 기기의 토큰을 다시 허용하지 않도록 인증 세대를 보관합니다.
ALTER TABLE users ADD COLUMN auth_version bigint NOT NULL DEFAULT 0;
ALTER TABLE users DROP CONSTRAINT users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'WITHDRAWAL_PENDING', 'WITHDRAWN'));
ALTER TABLE users ADD CONSTRAINT users_auth_version_check CHECK (auth_version >= 0);
ALTER TABLE users ADD CONSTRAINT users_withdrawal_grace_check CHECK (
    (status = 'WITHDRAWAL_PENDING' AND withdrawal_requested_at IS NOT NULL AND withdrawal_expires_at IS NOT NULL
        AND withdrawal_expires_at = withdrawal_requested_at + interval '720 hours')
    OR (status <> 'WITHDRAWAL_PENDING' AND withdrawal_requested_at IS NULL AND withdrawal_expires_at IS NULL)
);
CREATE INDEX users_pending_withdrawal_idx ON users (withdrawal_expires_at, id)
    WHERE status = 'WITHDRAWAL_PENDING' AND deleted_at IS NULL;
