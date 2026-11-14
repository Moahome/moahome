-- 공지 번호는 관리대상 안에서 한 번 부여한 뒤 수정·삭제 시에도 재사용하지 않습니다.
CREATE TABLE notices (
    id uuid PRIMARY KEY,
    property_id uuid NOT NULL REFERENCES properties(id),
    number bigint NOT NULL CHECK (number > 0),
    title varchar(200) NOT NULL CHECK (length(trim(title)) > 0),
    content text NOT NULL,
    important boolean NOT NULL DEFAULT false,
    views bigint NOT NULL DEFAULT 0 CHECK (views >= 0),
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    created_by uuid NOT NULL REFERENCES users(id),
    updated_by uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    deleted_at timestamptz,
    creation_fingerprint varchar(64) NOT NULL,
    last_request_id uuid NOT NULL,
    last_fingerprint varchar(64) NOT NULL,
    UNIQUE (property_id, number)
);

CREATE INDEX notices_list_idx ON notices (property_id, important DESC, number DESC) WHERE deleted_at IS NULL;
