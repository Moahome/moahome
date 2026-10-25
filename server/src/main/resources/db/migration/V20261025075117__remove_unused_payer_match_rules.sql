-- 현재 매칭은 payments의 최신 확정 이력을 직접 조회하므로 별도 연결 규칙 저장을 제거합니다.
-- 기존 Migration과 Flyway 이력은 유지하며 수납 원본·충당·감사 이력은 변경하지 않습니다.
-- 참조하는 트리거·FK부터 해제하고, 예상하지 못한 의존성은 CASCADE로 지우지 않고 실패시켜 롤백합니다.
DROP TRIGGER payments_stop_payer_rules ON payments;
DROP TRIGGER units_stop_payer_rules ON units;
DROP TRIGGER unit_residents_stop_payer_rules ON unit_residents;
DROP TRIGGER payer_match_rules_protect ON payer_match_rules;

DROP FUNCTION stop_payer_rules_for_payment();
DROP FUNCTION stop_payer_rules_for_occupancy();
DROP FUNCTION protect_payer_match_rule();

ALTER TABLE payments DROP CONSTRAINT payments_payer_match_rule_fk;
ALTER TABLE payments DROP COLUMN payer_match_rule_id;
DROP TABLE payer_match_rules;
