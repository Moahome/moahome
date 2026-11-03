-- 기존 관리대상 이용 권한은 유지하고 새 생성 권한만 계정별로 명시적으로 부여합니다.
-- 시스템 관리자도 예외 없이 같은 생성 권한을 사용하며 자동 승인을 하지 않습니다.
ALTER TABLE users ADD COLUMN property_creation_allowed boolean NOT NULL DEFAULT false;

CREATE TABLE system_admin_events (
    request_id uuid PRIMARY KEY,
    actor_id uuid NOT NULL REFERENCES users(id),
    target_id uuid NOT NULL REFERENCES users(id),
    action varchar(30) NOT NULL CHECK (action IN ('CREATION_PERMISSION', 'ADMIN_PROMOTION')),
    previous_value varchar(20) NOT NULL,
    requested_value varchar(20) NOT NULL,
    created_at timestamptz NOT NULL,
    CHECK ((action = 'CREATION_PERMISSION' AND previous_value IN ('true', 'false') AND requested_value IN ('true', 'false'))
        OR (action = 'ADMIN_PROMOTION' AND previous_value IN ('USER', 'ADMIN') AND requested_value = 'ADMIN'))
);
CREATE INDEX system_admin_events_target_created_idx ON system_admin_events(target_id, created_at DESC);
