-- 동별 기준 잔고를 통장×동으로 구분합니다. 통장이 하나인 기존 값만 소속이 명확하므로 이전합니다.
ALTER TABLE building_cash_openings ADD COLUMN bank_account_id uuid;
ALTER TABLE building_cash_opening_changes ADD COLUMN bank_account_id uuid;
ALTER TABLE building_cash_openings ADD CONSTRAINT cash_opening_account_fk FOREIGN KEY(property_id,bank_account_id) REFERENCES bank_accounts(property_id,id);
ALTER TABLE building_cash_opening_changes ADD CONSTRAINT cash_opening_change_account_fk FOREIGN KEY(property_id,bank_account_id) REFERENCES bank_accounts(property_id,id);
-- 기존 정정·불변 트리거를 잠시 제외한 스키마 이관이며 금액·기준일·버전·수정 이력은 바꾸지 않습니다.
ALTER TABLE building_cash_openings DISABLE TRIGGER building_cash_openings_change_check;
ALTER TABLE building_cash_opening_changes DISABLE TRIGGER cash_opening_changes_immutable;
UPDATE building_cash_openings o SET bank_account_id=a.id FROM bank_accounts a
 WHERE a.property_id=o.property_id AND a.deleted_at IS NULL AND a.building_id IS NULL
 AND (SELECT count(*) FROM bank_accounts b WHERE b.property_id=o.property_id AND b.deleted_at IS NULL AND b.building_id IS NULL)=1;
UPDATE building_cash_opening_changes c SET bank_account_id=o.bank_account_id FROM building_cash_openings o WHERE c.opening_id=o.id;
ALTER TABLE building_cash_openings ENABLE TRIGGER building_cash_openings_change_check;
ALTER TABLE building_cash_opening_changes ENABLE TRIGGER cash_opening_changes_immutable;
ALTER TABLE building_cash_openings DROP CONSTRAINT building_cash_openings_property_id_building_id_key;
CREATE UNIQUE INDEX cash_opening_account_building_idx ON building_cash_openings(property_id,bank_account_id,building_id) WHERE bank_account_id IS NOT NULL;
CREATE UNIQUE INDEX cash_opening_legacy_building_idx ON building_cash_openings(property_id,building_id) WHERE bank_account_id IS NULL;
-- 여러 통장의 기존 합계는 임의로 기본 통장에 배정하지 않고 미분류 합계 이력으로 남깁니다.
CREATE OR REPLACE FUNCTION record_cash_opening_change() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 PERFORM id FROM properties WHERE id=OLD.property_id FOR UPDATE;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.property_id IS DISTINCT FROM OLD.property_id
    OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id OR NEW.building_id IS DISTINCT FROM OLD.building_id OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.revision<>OLD.revision+1
    OR NEW.correction_request_id IS NULL OR NEW.correction_request_id IS NOT DISTINCT FROM OLD.correction_request_id
    OR NEW.updated_by IS NULL OR NEW.updated_at IS NULL THEN
  RAISE EXCEPTION 'cash opening correction metadata required' USING ERRCODE='23514';
 END IF;
 INSERT INTO building_cash_opening_changes(opening_id,property_id,building_id,bank_account_id,request_id,previous_revision,
  previous_cutoff_date,previous_amount,new_cutoff_date,new_amount,changed_by,changed_at)
 VALUES(OLD.id,OLD.property_id,OLD.building_id,OLD.bank_account_id,NEW.correction_request_id,OLD.revision,
  OLD.cutoff_date,OLD.amount,NEW.cutoff_date,NEW.amount,NEW.updated_by,NEW.updated_at);
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION validate_cash_opening_cutoff() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF (SELECT count(DISTINCT cutoff_date) FROM building_cash_openings
     WHERE property_id=NEW.property_id AND bank_account_id IS NOT DISTINCT FROM NEW.bank_account_id)>1 THEN
  RAISE EXCEPTION 'cash openings require a shared cutoff per account' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
