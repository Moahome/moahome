-- 기존 운영 데이터는 등록 당시 부과월을 유지합니다. 신규 대상은 운영 시작 확정 전 자동 부과하지 않습니다.
-- properties 갱신과 제약 추가는 테이블 잠금을 수반하므로 운영 배포 전 행 수와 적용 시간을 확인합니다.
ALTER TABLE properties
 ADD COLUMN management_started_at timestamptz,
 ADD COLUMN balance_cutoff_date date,
 ADD COLUMN first_billing_month date;
UPDATE properties SET management_started_at=created_at,
 first_billing_month=date_trunc('month',created_at AT TIME ZONE 'Asia/Seoul')::date;
ALTER TABLE properties ADD CONSTRAINT properties_management_start_check CHECK (
 (management_started_at IS NULL AND first_billing_month IS NULL AND balance_cutoff_date IS NULL)
 OR (management_started_at IS NOT NULL AND first_billing_month IS NOT NULL
     AND extract(day FROM first_billing_month)=1
     AND (balance_cutoff_date IS NULL OR first_billing_month>balance_cutoff_date))
);
ALTER TABLE charges ALTER COLUMN billing_period_id DROP NOT NULL;
ALTER TABLE charges ADD COLUMN charge_type varchar(30) NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE charges ADD CONSTRAINT charges_type_shape_check CHECK(
 (charge_type='MONTHLY' AND billing_period_id IS NOT NULL)
 OR (charge_type='OPENING_RECEIVABLE' AND billing_period_id IS NULL AND total_amount>0)
);
-- 취소 사유 CHECK의 기존 이름에 의존하지 않고 정의로 찾아 확장합니다.
DO $$
DECLARE c record;
BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='charges'::regclass AND contype='c'
  AND pg_get_constraintdef(oid) LIKE '%cancellation_reason%' LOOP
   EXECUTE format('ALTER TABLE charges DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE charges ADD CONSTRAINT charges_cancellation_reason_check CHECK(
 (status='CANCELED' AND canceled_at IS NOT NULL AND canceled_by IS NOT NULL
  AND cancellation_reason IN ('UNIT_DELETED','MANUAL_CANCELED','OPENING_CANCELED'))
 OR (status<>'CANCELED' AND canceled_at IS NULL AND canceled_by IS NULL AND cancellation_reason IS NULL)
);
CREATE TABLE opening_balance_batches (
 id uuid PRIMARY KEY, property_id uuid NOT NULL REFERENCES properties(id),
 cutoff_date date NOT NULL, first_billing_month date NOT NULL,
 status varchar(20) NOT NULL CHECK(status IN ('DRAFT','CONFIRMED','CANCELED')),
 revision bigint NOT NULL DEFAULT 0, edit_token uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL,
 confirmed_by uuid REFERENCES users(id), confirmed_at timestamptz,
 canceled_by uuid REFERENCES users(id), canceled_at timestamptz, cancel_reason varchar(500),
 UNIQUE(property_id,id),
 CHECK(first_billing_month>cutoff_date AND extract(day FROM first_billing_month)=1),
 CHECK((status IN ('CONFIRMED','CANCELED'))=(confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)),
 CHECK((status='CANCELED')=(canceled_by IS NOT NULL AND canceled_at IS NOT NULL AND cancel_reason IS NOT NULL))
);
CREATE UNIQUE INDEX opening_balance_active_batch_idx ON opening_balance_batches(property_id) WHERE status<>'CANCELED';
CREATE TABLE opening_balance_items (
 id uuid PRIMARY KEY, property_id uuid NOT NULL REFERENCES properties(id), batch_id uuid NOT NULL, unit_id uuid NOT NULL,
 receivable numeric(15,0) NOT NULL CHECK(receivable>=0), credit numeric(15,0) NOT NULL CHECK(credit>=0),
 charge_id uuid, origin_month varchar(7), responsibility_encrypted text,
 UNIQUE(property_id,id), UNIQUE(batch_id,unit_id), UNIQUE(charge_id),
 FOREIGN KEY(property_id,batch_id) REFERENCES opening_balance_batches(property_id,id),
 FOREIGN KEY(property_id,unit_id) REFERENCES units(property_id,id),
 FOREIGN KEY(property_id,charge_id) REFERENCES charges(property_id,id),
 CHECK(origin_month IS NULL OR origin_month ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$')
);
CREATE TABLE bank_opening_balances (
 id uuid PRIMARY KEY, property_id uuid NOT NULL REFERENCES properties(id), batch_id uuid NOT NULL,
 bank_account_id uuid NOT NULL, amount numeric(15,0) NOT NULL CHECK(amount>=0),
 UNIQUE(batch_id,bank_account_id),
 FOREIGN KEY(property_id,batch_id) REFERENCES opening_balance_batches(property_id,id),
 FOREIGN KEY(property_id,bank_account_id) REFERENCES bank_accounts(property_id,id)
);
CREATE TABLE credit_applications (
 id uuid PRIMARY KEY, property_id uuid NOT NULL REFERENCES properties(id), opening_item_id uuid NOT NULL, charge_id uuid NOT NULL,
 amount numeric(15,0) NOT NULL CHECK(amount>0), status varchar(20) NOT NULL CHECK(status IN ('ACTIVE','CANCELED')),
 applied_at timestamptz NOT NULL, applied_by uuid NOT NULL REFERENCES users(id),
 FOREIGN KEY(property_id,opening_item_id) REFERENCES opening_balance_items(property_id,id),
 FOREIGN KEY(property_id,charge_id) REFERENCES charges(property_id,id),
 UNIQUE(opening_item_id,charge_id)
);
CREATE INDEX credit_applications_charge_idx ON credit_applications(charge_id) WHERE status='ACTIVE';
-- 동일 관리대상 잠금은 직접 DB에서 배분할 때도 두 종류의 충당을 직렬화합니다.
CREATE FUNCTION lock_allocation_property() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM properties WHERE id=NEW.property_id FOR UPDATE;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_allocation_property_lock BEFORE INSERT OR UPDATE ON payment_allocations
 FOR EACH ROW EXECUTE FUNCTION lock_allocation_property();
CREATE TRIGGER credit_application_property_lock BEFORE INSERT OR UPDATE ON credit_applications
 FOR EACH ROW EXECUTE FUNCTION lock_allocation_property();

CREATE OR REPLACE FUNCTION validate_payment_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p payments%ROWTYPE; c charges%ROWTYPE;
BEGIN
 SELECT * INTO p FROM payments WHERE id=NEW.payment_id;
 SELECT * INTO c FROM charges WHERE id=NEW.charge_id;
 IF NEW.status='ACTIVE' AND (p.status<>'CONFIRMED' OR p.receipt_type<>'HOUSEHOLD'
  OR c.status<>'ISSUED' OR c.total_amount<=0 OR p.matched_unit_id IS DISTINCT FROM c.unit_id) THEN
  RAISE EXCEPTION 'Invalid payment allocation' USING ERRCODE='23514';
 END IF;
 IF (SELECT coalesce(sum(allocated_amount),0) FROM payment_allocations WHERE payment_id=p.id AND status='ACTIVE')>p.amount
 OR (SELECT coalesce(sum(allocated_amount),0) FROM payment_allocations WHERE charge_id=c.id AND status='ACTIVE')
  +(SELECT coalesce(sum(amount),0) FROM credit_applications WHERE charge_id=c.id AND status='ACTIVE')>c.total_amount THEN
  RAISE EXCEPTION 'Payment allocation exceeds balance' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION validate_credit_application() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE i opening_balance_items%ROWTYPE; c charges%ROWTYPE; b opening_balance_batches%ROWTYPE;
BEGIN
 SELECT * INTO i FROM opening_balance_items WHERE id=NEW.opening_item_id;
 SELECT * INTO c FROM charges WHERE id=NEW.charge_id;
 SELECT * INTO b FROM opening_balance_batches WHERE id=i.batch_id;
 IF NEW.status='ACTIVE' AND (b.status<>'CONFIRMED' OR c.status<>'ISSUED' OR c.total_amount<=0
  OR i.unit_id IS DISTINCT FROM c.unit_id OR i.property_id IS DISTINCT FROM c.property_id) THEN
  RAISE EXCEPTION 'Invalid opening credit application' USING ERRCODE='23514';
 END IF;
 IF (SELECT coalesce(sum(amount),0) FROM credit_applications WHERE opening_item_id=i.id AND status='ACTIVE')>i.credit
 OR (SELECT coalesce(sum(amount),0) FROM credit_applications WHERE charge_id=c.id AND status='ACTIVE')
  +(SELECT coalesce(sum(allocated_amount),0) FROM payment_allocations WHERE charge_id=c.id AND status='ACTIVE')>c.total_amount THEN
  RAISE EXCEPTION 'Credit application exceeds balance' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER credit_application_check AFTER INSERT OR UPDATE ON credit_applications
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_credit_application();
CREATE FUNCTION protect_credit_applied_charge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.status<>'ISSUED' OR NEW.total_amount<>OLD.total_amount)
 AND EXISTS(SELECT 1 FROM credit_applications WHERE charge_id=NEW.id AND status='ACTIVE') THEN
  RAISE EXCEPTION 'Cancel opening credit before changing charge' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER credit_applied_charge_guard BEFORE UPDATE OF status,total_amount ON charges
 FOR EACH ROW EXECUTE FUNCTION protect_credit_applied_charge();
-- 인계 금액을 직접 덮어써 이미 충당한 잔액과 불일치하게 만드는 변경을 막습니다.
CREATE FUNCTION protect_confirmed_opening_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch_state text;
BEGIN
 SELECT status INTO batch_state FROM opening_balance_batches WHERE id=OLD.batch_id;
 IF batch_state<>'DRAFT' AND (TG_OP='DELETE' OR NEW.receivable IS DISTINCT FROM OLD.receivable
  OR NEW.credit IS DISTINCT FROM OLD.credit OR NEW.unit_id IS DISTINCT FROM OLD.unit_id OR NEW.batch_id IS DISTINCT FROM OLD.batch_id) THEN
  RAISE EXCEPTION 'Confirmed opening balances are immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER confirmed_opening_item_guard BEFORE UPDATE OR DELETE ON opening_balance_items
 FOR EACH ROW EXECUTE FUNCTION protect_confirmed_opening_item();

-- 설치 스키마를 고정해 public과 테스트 스키마 모두 같은 테이블을 검증합니다.
DO $$
DECLARE f text;
BEGIN
 FOREACH f IN ARRAY ARRAY['lock_allocation_property','validate_payment_allocation','validate_credit_application',
  'protect_credit_applied_charge','protect_confirmed_opening_item'] LOOP
  EXECUTE format('ALTER FUNCTION %I() SET search_path TO %I, pg_temp',f,current_schema());
 END LOOP;
END $$;

