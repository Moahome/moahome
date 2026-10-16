-- 항목 코드는 JPA Enum·API 계약과 같은 허용값만 저장해 조회 중 Enum 변환 실패를 방지합니다.
-- 직접 입력 항목은 이름을 보존하고 코드를 NULL로 유지합니다. 기존 미지원 코드는 사전 정정이 필요합니다.
ALTER TABLE fee_template_items ADD CONSTRAINT fee_template_items_item_code_check
 CHECK (item_code IS NULL OR item_code IN (
  'GENERAL_MANAGEMENT', 'CLEANING', 'ELEVATOR_MAINTENANCE', 'COMMON_ELECTRICITY',
  'COMMON_WATER', 'SEPTIC_TANK_CLEANING', 'WASTE_DISPOSAL'
 ));

ALTER TABLE charge_items ADD CONSTRAINT charge_items_item_code_check
 CHECK (item_code IS NULL OR item_code IN (
  'GENERAL_MANAGEMENT', 'CLEANING', 'ELEVATOR_MAINTENANCE', 'COMMON_ELECTRICITY',
  'COMMON_WATER', 'SEPTIC_TANK_CLEANING', 'WASTE_DISPOSAL'
 ));
