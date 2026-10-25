-- 기존 수납·원본·충당을 변경하지 않고 관리자가 확인한 재사용 연결만 별도로 저장합니다.
CREATE TABLE payer_match_rules (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 payer_name_encrypted text NOT NULL,
 payer_name_hmac char(64) NOT NULL,
 unit_id uuid NOT NULL,
 source_payment_id uuid NOT NULL,
 valid_from date NOT NULL,
 active boolean NOT NULL DEFAULT true,
 registered_by uuid NOT NULL REFERENCES users(id),
 registered_at timestamptz NOT NULL,
 stopped_by uuid REFERENCES users(id),
 stopped_at timestamptz,
 stop_reason varchar(40),
 UNIQUE(property_id,id),
 FOREIGN KEY(property_id,unit_id) REFERENCES units(property_id,id),
 FOREIGN KEY(property_id,source_payment_id) REFERENCES payments(property_id,id),
 CHECK(active = (stopped_at IS NULL AND stop_reason IS NULL)),
 CHECK(active OR (stopped_at IS NOT NULL AND stop_reason IS NOT NULL))
);
CREATE UNIQUE INDEX payer_match_rules_active_name_idx ON payer_match_rules(property_id,payer_name_hmac) WHERE active;
ALTER TABLE payments ADD COLUMN payer_match_rule_id uuid;
ALTER TABLE payments ADD CONSTRAINT payments_payer_match_rule_fk
 FOREIGN KEY(property_id,payer_match_rule_id) REFERENCES payer_match_rules(property_id,id);

-- 수납을 취소·삭제하거나 다른 세대로 직접 확정하는 모든 경로에서 기존 연결을 중지합니다.
-- 이전 자동 확정 수납은 이동·취소하지 않으며 시스템 중지는 stopped_by=NULL로 구분합니다.
CREATE FUNCTION stop_payer_rules_for_payment() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 UPDATE payer_match_rules SET active=false, stopped_at=NEW.updated_at,
   stopped_by=CASE WHEN source_payment_id=NEW.id THEN COALESCE(NEW.canceled_by,NEW.deleted_by) ELSE NEW.confirmed_by END,
   stop_reason=CASE WHEN source_payment_id=NEW.id THEN 'SOURCE_INVALIDATED' ELSE 'PAYMENT_CONFLICT' END
 WHERE active AND property_id=NEW.property_id AND (
   (source_payment_id=NEW.id AND (NEW.status<>'CONFIRMED' OR NEW.deleted_at IS NOT NULL)) OR
   (NEW.status='CONFIRMED' AND NEW.receipt_type='HOUSEHOLD' AND NEW.bank_transaction_id IS NOT NULL
    AND NEW.deleted_at IS NULL AND payer_name_hmac=NEW.payer_name_hmac AND unit_id<>NEW.matched_unit_id
    AND valid_from<=NEW.payment_date));
 RETURN NEW;
END $$;
CREATE TRIGGER payments_stop_payer_rules AFTER INSERT OR UPDATE OF status,deleted_at,matched_unit_id ON payments
 FOR EACH ROW EXECUTE FUNCTION stop_payer_rules_for_payment();

-- 주민의 전출·이동·입주 교체와 세대 사용 종료를 DB 변경과 원자적으로 반영합니다.
-- 대표 지정이나 연락처 변경만으로는 연결을 중지하지 않습니다.
CREATE FUNCTION stop_payer_rules_for_occupancy() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE target_unit uuid; target_property uuid; target_at timestamptz; secondary_unit uuid;
BEGIN
 IF TG_TABLE_NAME='units' THEN
   IF NEW.status=OLD.status AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN RETURN NEW; END IF;
   target_unit=NEW.id; target_property=NEW.property_id; target_at=NEW.updated_at;
 ELSE
   IF TG_OP='UPDATE' THEN
     IF NEW.status=OLD.status AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at AND NEW.unit_id=OLD.unit_id THEN RETURN NEW; END IF;
     target_unit=OLD.unit_id;
   ELSE target_unit=NEW.unit_id;
   END IF;
   target_property=NEW.property_id; target_at=NEW.updated_at; secondary_unit=NEW.unit_id;
 END IF;
 UPDATE payer_match_rules SET active=false,stopped_at=target_at,stopped_by=NULL,stop_reason='OCCUPANCY_CHANGED'
 WHERE active AND property_id=target_property AND (unit_id=target_unit OR unit_id=secondary_unit);
 RETURN NEW;
END $$;
CREATE TRIGGER units_stop_payer_rules AFTER UPDATE OF status,deleted_at ON units
 FOR EACH ROW EXECUTE FUNCTION stop_payer_rules_for_occupancy();
CREATE TRIGGER unit_residents_stop_payer_rules AFTER INSERT OR UPDATE OF status,deleted_at,unit_id ON unit_residents
 FOR EACH ROW EXECUTE FUNCTION stop_payer_rules_for_occupancy();
