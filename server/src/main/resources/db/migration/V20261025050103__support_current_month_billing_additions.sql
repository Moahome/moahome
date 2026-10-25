-- 추가 부과의 요청·처리 근거를 기존 월별 기본 청구와 분리해 보존합니다.
CREATE TABLE billing_additions (
    id uuid PRIMARY KEY,
    property_id uuid NOT NULL REFERENCES properties(id),
    billing_period_id uuid NOT NULL,
    template_id uuid NOT NULL,
    request_id uuid NOT NULL,
    request_fingerprint varchar(64) NOT NULL,
    created_by uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL,
    UNIQUE(property_id, request_id),
    UNIQUE(property_id, id, billing_period_id),
    FOREIGN KEY(property_id, billing_period_id) REFERENCES billing_periods(property_id, id),
    FOREIGN KEY(property_id, template_id) REFERENCES fee_templates(property_id, id)
);
ALTER TABLE charges ADD COLUMN billing_addition_id uuid;
ALTER TABLE charges ADD CONSTRAINT charges_addition_period_fk
    FOREIGN KEY(property_id, billing_addition_id, billing_period_id)
    REFERENCES billing_additions(property_id, id, billing_period_id);
ALTER TABLE charges ADD CONSTRAINT charges_addition_type_check
    CHECK(billing_addition_id IS NULL OR charge_type='MONTHLY');
-- 기본은 월·세대당 한 건을 유지하고, 추가 부과는 요청·세대당 한 건만 허용합니다.
-- 기존 청구 ID·항목·수납 배분·합계는 변경하지 않으며 제약 교체는 같은 트랜잭션입니다.
ALTER TABLE charges DROP CONSTRAINT charges_billing_period_id_unit_id_key;
CREATE UNIQUE INDEX charges_base_period_unit_idx ON charges(billing_period_id, unit_id)
    WHERE billing_addition_id IS NULL;
CREATE UNIQUE INDEX charges_addition_unit_idx ON charges(billing_addition_id, unit_id)
    WHERE billing_addition_id IS NOT NULL;
