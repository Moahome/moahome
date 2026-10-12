-- 삭제된 세대의 ID·주민 관계·청구는 보존하고 현재 세대끼리만 동/호수 중복을 제한합니다.
-- 같은 호수를 다시 추가하면 새 ID를 사용하므로 과거 청구나 삭제된 주민이 자동 연결되지 않습니다.
ALTER TABLE units DROP CONSTRAINT units_building_id_unit_number_key;
DROP INDEX units_without_building_number_idx;

CREATE UNIQUE INDEX units_building_number_idx
    ON units(building_id, unit_number) WHERE building_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX units_without_building_number_idx
    ON units(property_id, unit_number) WHERE building_id IS NULL AND deleted_at IS NULL;
