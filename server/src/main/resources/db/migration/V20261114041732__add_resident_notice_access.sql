-- 기존 관리자 공지는 명시적으로 공개하기 전까지 주민에게 노출하지 않습니다.
ALTER TABLE notices ADD COLUMN resident_published boolean NOT NULL DEFAULT false;
CREATE INDEX notices_resident_list_idx ON notices (property_id, important DESC, number DESC)
    WHERE deleted_at IS NULL AND resident_published;

-- 건물별 활성 링크는 하나이며 회수된 ID는 재사용하지 않습니다. 토큰 원문은 저장하지 않습니다.
CREATE TABLE notice_access_links (
    id uuid PRIMARY KEY,
    property_id uuid NOT NULL REFERENCES properties(id),
    created_by uuid NOT NULL REFERENCES users(id),
    nonce varchar(43) NOT NULL,
    token_hash varchar(64) NOT NULL UNIQUE,
    created_at timestamptz NOT NULL,
    revoked_at timestamptz
);
CREATE UNIQUE INDEX notice_access_links_active_idx ON notice_access_links(property_id) WHERE revoked_at IS NULL;
