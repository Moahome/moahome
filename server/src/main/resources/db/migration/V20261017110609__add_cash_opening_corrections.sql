-- 사용자가 기준일과 동별 잔고를 정정할 수 있도록 하되 이전 값·수정자를 보존합니다.
ALTER TABLE building_cash_openings ADD COLUMN revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0);
ALTER TABLE building_cash_openings ADD COLUMN correction_request_id uuid;
ALTER TABLE building_cash_openings ADD COLUMN updated_by uuid REFERENCES users(id);
ALTER TABLE building_cash_openings ADD COLUMN updated_at timestamptz;
CREATE TABLE building_cash_opening_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 opening_id uuid NOT NULL REFERENCES building_cash_openings(id),
 property_id uuid NOT NULL REFERENCES properties(id),
 building_id uuid NOT NULL,
 request_id uuid NOT NULL,
 previous_revision bigint NOT NULL CHECK(previous_revision>=0),
 previous_cutoff_date date NOT NULL,
 previous_amount numeric(15,0) NOT NULL,
 new_cutoff_date date NOT NULL,
 new_amount numeric(15,0) NOT NULL,
 changed_by uuid NOT NULL REFERENCES users(id),
 changed_at timestamptz NOT NULL,
 UNIQUE(opening_id,previous_revision),
 FOREIGN KEY(property_id,building_id) REFERENCES buildings(property_id,id)
);
CREATE INDEX cash_opening_changes_request_idx ON building_cash_opening_changes(request_id);
CREATE TRIGGER cash_opening_changes_immutable BEFORE UPDATE OR DELETE ON building_cash_opening_changes
 FOR EACH ROW EXECUTE FUNCTION protect_cash_balance_history();

-- 일반 덮어쓰기는 계속 차단합니다. 요청 ID·수정자·연속 버전을 포함한 정정만 이전 값을 기록한 뒤 허용합니다.
DROP TRIGGER building_cash_openings_immutable ON building_cash_openings;
CREATE TRIGGER building_cash_openings_delete_check BEFORE DELETE ON building_cash_openings
 FOR EACH ROW EXECUTE FUNCTION protect_cash_balance_history();
CREATE FUNCTION record_cash_opening_change() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 PERFORM id FROM properties WHERE id=OLD.property_id FOR UPDATE;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.property_id IS DISTINCT FROM OLD.property_id
    OR NEW.building_id IS DISTINCT FROM OLD.building_id OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.revision<>OLD.revision+1
    OR NEW.correction_request_id IS NULL OR NEW.correction_request_id IS NOT DISTINCT FROM OLD.correction_request_id
    OR NEW.updated_by IS NULL OR NEW.updated_at IS NULL THEN
  RAISE EXCEPTION 'cash opening correction metadata required' USING ERRCODE='23514';
 END IF;
 INSERT INTO building_cash_opening_changes(opening_id,property_id,building_id,request_id,previous_revision,
  previous_cutoff_date,previous_amount,new_cutoff_date,new_amount,changed_by,changed_at)
 VALUES(OLD.id,OLD.property_id,OLD.building_id,NEW.correction_request_id,OLD.revision,
  OLD.cutoff_date,OLD.amount,NEW.cutoff_date,NEW.amount,NEW.updated_by,NEW.updated_at);
 RETURN NEW;
END $$;
CREATE TRIGGER building_cash_openings_change_check BEFORE UPDATE ON building_cash_openings
 FOR EACH ROW EXECUTE FUNCTION record_cash_opening_change();

-- 모든 동의 기준일을 한 트랜잭션에서 변경하게 해 서로 다른 기준 잔고를 합산하지 않게 합니다.
CREATE FUNCTION validate_cash_opening_cutoff() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF (SELECT count(DISTINCT cutoff_date) FROM building_cash_openings WHERE property_id=NEW.property_id)>1 THEN
  RAISE EXCEPTION 'cash openings require a shared cutoff date' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER building_cash_openings_cutoff_check AFTER INSERT OR UPDATE ON building_cash_openings
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_cash_opening_cutoff();
