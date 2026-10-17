-- 정산 제외는 거래 삭제나 회수 완료가 아닙니다. 관리자 결정의 이력을 추가하고 원본·회수 기록은 보존합니다.
CREATE TABLE external_settlement_decisions (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 allocation_id uuid NOT NULL,
 excluded boolean NOT NULL,
 revision bigint NOT NULL CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL,
 UNIQUE(property_id,allocation_id,revision),
 FOREIGN KEY(property_id,allocation_id) REFERENCES expense_allocations(property_id,id)
);
CREATE TRIGGER external_settlement_decisions_immutable BEFORE UPDATE OR DELETE ON external_settlement_decisions
 FOR EACH ROW EXECUTE FUNCTION protect_cash_balance_history();

-- 같은 관리대상 잠금과 연속 버전으로 동시에 발생한 제외·복원 결정을 직렬화합니다.
CREATE FUNCTION validate_external_settlement_decision() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE previous_revision bigint; target_building uuid;
BEGIN
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 SELECT building_id INTO target_building FROM expense_allocations WHERE property_id=NEW.property_id AND id=NEW.allocation_id;
 IF NOT FOUND OR target_building IS NOT NULL THEN
  RAISE EXCEPTION 'only external allocation can be excluded' USING ERRCODE='23514';
 END IF;
 SELECT COALESCE(max(revision),0) INTO previous_revision FROM external_settlement_decisions
  WHERE property_id=NEW.property_id AND allocation_id=NEW.allocation_id;
 IF NEW.revision<>previous_revision+1 THEN
  RAISE EXCEPTION 'stale external settlement decision' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER external_settlement_decisions_check BEFORE INSERT ON external_settlement_decisions
 FOR EACH ROW EXECUTE FUNCTION validate_external_settlement_decision();

-- 제외 이후 새 회수 연결은 차단합니다. 기존 연결은 그대로 보존하고 복원하면 다시 연결할 수 있습니다.
CREATE FUNCTION guard_external_settlement_exclusion() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE is_excluded boolean;
BEGIN
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 SELECT excluded INTO is_excluded FROM external_settlement_decisions
  WHERE property_id=NEW.property_id AND allocation_id=NEW.allocation_id ORDER BY revision DESC LIMIT 1;
 IF COALESCE(is_excluded,false) THEN
  RAISE EXCEPTION 'external allocation excluded from settlement' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER external_settlement_exclusion_check BEFORE INSERT ON external_settlement_links
 FOR EACH ROW EXECUTE FUNCTION guard_external_settlement_exclusion();
