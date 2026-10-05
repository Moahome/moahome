-- 마지막 등록에서 필요한 업무 데이터만 생성합니다. 주민·회계 테이블은 각 기능 구현 시 추가합니다.
CREATE TABLE properties (
    id uuid PRIMARY KEY,
    name varchar(50) NOT NULL CHECK (btrim(name) <> ''),
    address varchar(255) NOT NULL CHECK (btrim(address) <> ''),
    address_detail varchar(255),
    property_type varchar(30),
    has_buildings boolean NOT NULL,
    status varchar(20) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    deleted_at timestamptz,
    deleted_by uuid REFERENCES users(id)
);

CREATE TABLE buildings (
    id uuid PRIMARY KEY,
    property_id uuid NOT NULL REFERENCES properties(id),
    name varchar(50) NOT NULL CHECK (btrim(name) <> ''),
    sort_order integer NOT NULL CHECK (sort_order >= 0),
    status varchar(20) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    deleted_at timestamptz,
    deleted_by uuid REFERENCES users(id),
    UNIQUE (property_id, id)
);
CREATE UNIQUE INDEX buildings_property_name_idx ON buildings(property_id, name) WHERE deleted_at IS NULL;

CREATE TABLE units (
    id uuid PRIMARY KEY,
    property_id uuid NOT NULL REFERENCES properties(id),
    building_id uuid,
    unit_number varchar(30) NOT NULL CHECK (btrim(unit_number) <> ''),
    display_name varchar(50),
    floor smallint,
    status varchar(20) NOT NULL CHECK (status IN ('ACTIVE', 'VACANT', 'INACTIVE')),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    deleted_at timestamptz,
    deleted_by uuid REFERENCES users(id),
    -- 복합 FK로 세대와 동이 서로 다른 관리대상에 연결되는 것을 차단합니다.
    FOREIGN KEY (property_id, building_id) REFERENCES buildings(property_id, id),
    UNIQUE (building_id, unit_number)
);
CREATE UNIQUE INDEX units_without_building_number_idx
    ON units(property_id, unit_number) WHERE building_id IS NULL;

CREATE TABLE property_members (
    id uuid PRIMARY KEY,
    property_id uuid NOT NULL REFERENCES properties(id),
    user_id uuid NOT NULL REFERENCES users(id),
    role varchar(20) NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'RESIDENT')),
    status varchar(20) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
    joined_at timestamptz NOT NULL,
    ended_at timestamptz,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    deleted_at timestamptz,
    deleted_by uuid REFERENCES users(id),
    CHECK (ended_at IS NULL OR ended_at >= joined_at)
);
CREATE INDEX property_members_access_idx ON property_members(user_id, property_id);

CREATE TABLE bank_accounts (
    id uuid PRIMARY KEY,
    property_id uuid NOT NULL REFERENCES properties(id),
    building_id uuid,
    -- 미구현 주민·회계 도메인의 연결 컬럼은 초기 등록에서 NULL이며 해당 테이블 구현 시 FK를 추가합니다.
    holder_resident_id uuid,
    holder_name_snapshot varchar(50) NOT NULL CHECK (btrim(holder_name_snapshot) <> ''),
    bank_code varchar(20) NOT NULL CHECK (btrim(bank_code) <> ''),
    bank_name varchar(50) NOT NULL CHECK (btrim(bank_name) <> ''),
    account_number_encrypted text NOT NULL CHECK (account_number_encrypted <> ''),
    account_number_hmac char(64) NOT NULL CHECK (account_number_hmac ~ '^[0-9a-f]{64}$'),
    account_last4 varchar(4) NOT NULL CHECK (account_last4 ~ '^[0-9]{4}$'),
    gl_account_id uuid,
    is_primary boolean NOT NULL,
    valid_from date NOT NULL,
    valid_to date,
    status varchar(20) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'CLOSED')),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    deleted_at timestamptz,
    deleted_by uuid REFERENCES users(id),
    FOREIGN KEY (property_id, building_id) REFERENCES buildings(property_id, id),
    CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX bank_accounts_property_idx ON bank_accounts(property_id);

CREATE TABLE fee_templates (
    id uuid PRIMARY KEY,
    property_id uuid NOT NULL REFERENCES properties(id),
    name varchar(100) NOT NULL CHECK (btrim(name) <> ''),
    is_default boolean NOT NULL,
    effective_from date,
    effective_to date,
    status varchar(20) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    deleted_at timestamptz,
    deleted_by uuid REFERENCES users(id),
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);
CREATE INDEX fee_templates_property_idx ON fee_templates(property_id);

CREATE TABLE fee_template_items (
    id uuid PRIMARY KEY,
    fee_template_id uuid NOT NULL REFERENCES fee_templates(id),
    item_code varchar(30),
    item_name varchar(100) NOT NULL CHECK (btrim(item_name) <> ''),
    default_amount numeric(15,0) NOT NULL CHECK (default_amount >= 0),
    revenue_account_id uuid,
    sort_order integer NOT NULL CHECK (sort_order >= 0),
    is_active boolean NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    deleted_at timestamptz,
    deleted_by uuid REFERENCES users(id)
);
CREATE INDEX fee_template_items_template_idx ON fee_template_items(fee_template_id);

-- 성공한 전체 등록과 같은 트랜잭션에서만 저장합니다. 잠금 대기·실패에는 성공 결과가 남지 않습니다.
CREATE TABLE property_registration_results (
    user_id uuid NOT NULL REFERENCES users(id),
    request_id uuid NOT NULL,
    request_fingerprint char(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
    fingerprint_key_version varchar(30) NOT NULL CHECK (btrim(fingerprint_key_version) <> ''),
    property_id uuid NOT NULL UNIQUE REFERENCES properties(id),
    response_snapshot jsonb NOT NULL CHECK (jsonb_typeof(response_snapshot) = 'object'),
    created_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, request_id)
);
