-- 기존 등록 항목은 등록한 달의 기준으로 보존하며 첫 실제 부과는 다음 달부터 수행합니다.
ALTER TABLE fee_templates ADD COLUMN revision bigint NOT NULL DEFAULT 0;
ALTER TABLE fee_templates ADD COLUMN change_reason varchar(1000);
ALTER TABLE fee_templates ADD COLUMN changed_by uuid REFERENCES users(id);
UPDATE fee_templates SET effective_from = date_trunc('month', created_at AT TIME ZONE 'Asia/Seoul')::date
WHERE effective_from IS NULL;
ALTER TABLE fee_templates ALTER COLUMN effective_from SET NOT NULL;
-- 동일 관리대상의 버전 순서를 잠금으로 직렬화하고 DB에서도 중복 버전을 차단합니다.
CREATE UNIQUE INDEX fee_templates_revision_idx ON fee_templates(property_id, revision);
ALTER TABLE fee_templates ADD CONSTRAINT fee_templates_change_reason_check CHECK (
    revision >= 0 AND (revision = 0 OR (change_reason IS NOT NULL AND btrim(change_reason) <> '' AND changed_by IS NOT NULL))
);
CREATE TABLE billing_periods (
    id uuid PRIMARY KEY,
    property_id uuid NOT NULL REFERENCES properties(id),
    billing_year smallint NOT NULL CHECK (billing_year BETWEEN 1000 AND 9999),
    billing_month smallint NOT NULL CHECK (billing_month BETWEEN 1 AND 12),
    billing_date date NOT NULL,
    default_due_date date NOT NULL,
    status varchar(20) NOT NULL CHECK (status IN ('DRAFT', 'ISSUED')),
    confirmation_source varchar(20) NOT NULL CHECK (confirmation_source = 'SCHEDULE'),
    confirmed_at timestamptz,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE (property_id, billing_year, billing_month),
    UNIQUE (property_id, id),
    CHECK (billing_date = make_date(billing_year, billing_month, 1)),
    CHECK (default_due_date = (billing_date + interval '1 month - 1 day')::date),
    CHECK ((status = 'ISSUED') = (confirmed_at IS NOT NULL))
);
ALTER TABLE units ADD CONSTRAINT units_property_id_id_unique UNIQUE (property_id, id);
CREATE TABLE charges (
    id uuid PRIMARY KEY,
    property_id uuid NOT NULL REFERENCES properties(id),
    billing_period_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    building_name_snapshot varchar(50) NOT NULL,
    unit_number_snapshot varchar(30) NOT NULL CHECK (btrim(unit_number_snapshot) <> ''),
    unit_display_name_snapshot varchar(50),
    total_amount numeric(15,0) NOT NULL,
    due_date date NOT NULL,
    status varchar(20) NOT NULL CHECK (status IN ('DRAFT', 'ISSUED')),
    issued_at timestamptz,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    FOREIGN KEY (property_id, billing_period_id) REFERENCES billing_periods(property_id, id),
    FOREIGN KEY (property_id, unit_id) REFERENCES units(property_id, id),
    UNIQUE (billing_period_id, unit_id),
    UNIQUE (property_id, id),
    CHECK ((status = 'ISSUED') = (issued_at IS NOT NULL))
);
CREATE INDEX charges_property_idx ON charges(property_id);
CREATE TABLE charge_items (
    id uuid PRIMARY KEY,
    property_id uuid NOT NULL REFERENCES properties(id),
    charge_id uuid NOT NULL,
    source_template_item_id uuid NOT NULL REFERENCES fee_template_items(id),
    item_code varchar(30),
    item_name varchar(100) NOT NULL CHECK (btrim(item_name) <> ''),
    amount numeric(15,0) NOT NULL,
    revenue_account_id uuid,
    sort_order integer NOT NULL CHECK (sort_order >= 0),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    FOREIGN KEY (property_id, charge_id) REFERENCES charges(property_id, id),
    UNIQUE (charge_id, sort_order)
);
CREATE INDEX charge_items_charge_idx ON charge_items(charge_id);
