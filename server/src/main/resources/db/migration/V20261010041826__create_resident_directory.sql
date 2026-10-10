-- 주민 목록에서 실제 명부와 현재 세대 소속을 조회하기 위한 최소 스키마입니다.
-- 가입 요청·등록 API·대표 자동 지정 로직은 이 Migration에서 만들지 않습니다.
CREATE TABLE residents (
    id uuid PRIMARY KEY,
    property_id uuid NOT NULL REFERENCES properties(id),
    name varchar(50) NOT NULL CHECK (btrim(name) <> ''),
    phone_encrypted text,
    phone_hmac char(64) CHECK (phone_hmac ~ '^[0-9a-f]{64}$'),
    phone_last4 char(4) CHECK (phone_last4 ~ '^[0-9]{4}$'),
    user_id uuid REFERENCES users(id),
    status varchar(20) NOT NULL CHECK (status IN ('ACTIVE', 'MOVED_OUT', 'INACTIVE')),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    deleted_at timestamptz,
    deleted_by uuid REFERENCES users(id),
    UNIQUE (property_id, id),
    CHECK ((phone_encrypted IS NULL AND phone_hmac IS NULL AND phone_last4 IS NULL)
        OR (phone_encrypted IS NOT NULL AND phone_hmac IS NOT NULL AND phone_last4 IS NOT NULL))
);
CREATE UNIQUE INDEX residents_property_user_idx ON residents(property_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX residents_property_idx ON residents(property_id) WHERE deleted_at IS NULL;

-- 복합 FK가 참조할 세대의 관리대상·ID 조합을 보장합니다. 기존 세대 ID와 데이터는 유지합니다.
ALTER TABLE units ADD CONSTRAINT units_property_id_unique UNIQUE (property_id, id);

CREATE TABLE unit_residents (
    id uuid PRIMARY KEY,
    property_id uuid NOT NULL REFERENCES properties(id),
    unit_id uuid NOT NULL,
    resident_id uuid NOT NULL,
    relation_type varchar(20) NOT NULL CHECK (relation_type IN ('OWNER', 'TENANT', 'FAMILY', 'OTHER')),
    is_household_rep boolean NOT NULL,
    move_in_date date,
    move_out_date date,
    status varchar(20) NOT NULL CHECK (status IN ('ACTIVE', 'MOVED_OUT', 'INACTIVE')),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    deleted_at timestamptz,
    deleted_by uuid REFERENCES users(id),
    -- 주민·세대와 다른 관리대상의 관계를 저장할 수 없도록 소속까지 함께 참조합니다.
    FOREIGN KEY (property_id, resident_id) REFERENCES residents(property_id, id),
    FOREIGN KEY (property_id, unit_id) REFERENCES units(property_id, id),
    CHECK (move_out_date IS NULL OR move_in_date IS NULL OR move_out_date >= move_in_date)
);
-- 과거 관계는 보존하며 한 주민의 현재 세대 소속만 하나로 제한합니다.
CREATE UNIQUE INDEX unit_residents_active_resident_idx ON unit_residents(property_id, resident_id)
    WHERE status = 'ACTIVE' AND deleted_at IS NULL;
CREATE INDEX unit_residents_unit_idx ON unit_residents(property_id, unit_id) WHERE deleted_at IS NULL;
