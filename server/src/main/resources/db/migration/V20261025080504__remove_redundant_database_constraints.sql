-- 같은 (property_id, id)를 보장하는 기존 units_property_id_unique와 그 인덱스를 유지합니다.
-- 모든 세대 복합 FK는 기존 제약을 참조하므로 참조가 없는 중복 제약·인덱스만 제거합니다.
ALTER TABLE units DROP CONSTRAINT units_property_id_id_unique;

-- 두 컬럼이 NOT NULL인 (property_id, fee_template_id) 복합 FK가 존재 여부와 관리대상 일치를 함께 보장합니다.
-- 참조 동작과 지연 여부가 같은 단일 FK의 중복 검사만 제거하고 복합 FK는 유지합니다.
ALTER TABLE fee_template_items DROP CONSTRAINT fee_template_items_fee_template_id_fkey;
