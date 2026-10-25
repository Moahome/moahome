-- 기존 반복 설정과 원본 항목 ID는 유지하고 기본·임시 부과의 범위를 독립적으로 저장합니다.
ALTER TABLE fee_templates ADD COLUMN billing_mode varchar(20) NOT NULL DEFAULT 'ALL'
    CHECK (billing_mode IN ('ALL', 'BUILDING'));
ALTER TABLE fee_templates ADD COLUMN temporary_mode varchar(20) NOT NULL DEFAULT 'ALL'
    CHECK (temporary_mode IN ('ALL', 'BUILDING'));
ALTER TABLE fee_templates ADD CONSTRAINT fee_templates_property_id_id_unique UNIQUE (property_id, id);

ALTER TABLE fee_template_items ADD COLUMN property_id uuid;
ALTER TABLE fee_template_items ADD COLUMN building_id uuid;
ALTER TABLE fee_template_items ADD COLUMN is_temporary boolean NOT NULL DEFAULT false;
ALTER TABLE fee_template_items ADD COLUMN note varchar(500);
-- 기존 항목의 관리대상은 연결된 원본 템플릿에서만 보정하며 청구 스냅샷은 변경하지 않습니다.
UPDATE fee_template_items i SET property_id = t.property_id FROM fee_templates t WHERE t.id = i.fee_template_id;
ALTER TABLE fee_template_items ALTER COLUMN property_id SET NOT NULL;
ALTER TABLE fee_template_items ADD CONSTRAINT fee_template_items_property_template_fk
    FOREIGN KEY (property_id, fee_template_id) REFERENCES fee_templates(property_id, id);
ALTER TABLE fee_template_items ADD CONSTRAINT fee_template_items_property_building_fk
    FOREIGN KEY (property_id, building_id) REFERENCES buildings(property_id, id);
