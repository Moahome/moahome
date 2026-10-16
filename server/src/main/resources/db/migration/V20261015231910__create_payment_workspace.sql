-- 원본 거래와 수납·청구 배분을 분리하고 모든 참조를 같은 관리대상으로 제한합니다.
ALTER TABLE bank_accounts ADD CONSTRAINT bank_accounts_property_id_id_unique UNIQUE(property_id,id);
CREATE TABLE bank_transactions (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 bank_account_id uuid NOT NULL,
 transaction_date date NOT NULL,
 amount numeric(15,0) NOT NULL CHECK(amount > 0),
 payer_name_encrypted text NOT NULL,
 payer_name_hmac char(64) NOT NULL,
 memo_encrypted text,
 bank_reference varchar(200),
 deduplication_key char(64) NOT NULL,
 imported_by uuid NOT NULL REFERENCES users(id),
 imported_at timestamptz NOT NULL,
 FOREIGN KEY(property_id,bank_account_id) REFERENCES bank_accounts(property_id,id),
 UNIQUE(property_id,id),
 UNIQUE(bank_account_id,deduplication_key)
);
CREATE TABLE payments (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 bank_account_id uuid NOT NULL,
 bank_transaction_id uuid,
 matched_unit_id uuid,
 payer_resident_id uuid,
 payment_date date NOT NULL,
 amount numeric(15,0) NOT NULL CHECK(amount > 0),
 source_type varchar(20) NOT NULL CHECK(source_type IN ('MANUAL','BANK_IMPORT')),
 payer_name_encrypted text NOT NULL,
 payer_name_hmac char(64) NOT NULL,
 memo_encrypted text,
 status varchar(20) NOT NULL CHECK(status IN ('PENDING','ON_HOLD','CONFIRMED','CANCELED','LINKED')),
 linked_payment_id uuid,
 hold_reason_encrypted text,
 separate_reason_encrypted text,
 confirmed_by uuid REFERENCES users(id),
 confirmed_at timestamptz,
 canceled_by uuid REFERENCES users(id),
 canceled_at timestamptz,
 cancel_reason_encrypted text,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 FOREIGN KEY(property_id,bank_account_id) REFERENCES bank_accounts(property_id,id),
 FOREIGN KEY(property_id,bank_transaction_id) REFERENCES bank_transactions(property_id,id),
 FOREIGN KEY(property_id,matched_unit_id) REFERENCES units(property_id,id),
 FOREIGN KEY(property_id,payer_resident_id) REFERENCES residents(property_id,id),
 UNIQUE(property_id,id),
 FOREIGN KEY(property_id,linked_payment_id) REFERENCES payments(property_id,id),
 CHECK((status IN ('CONFIRMED','CANCELED')) = (confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)),
 CHECK((status = 'CANCELED') = (canceled_at IS NOT NULL AND canceled_by IS NOT NULL AND cancel_reason_encrypted IS NOT NULL)),
 CHECK(status NOT IN ('CONFIRMED','CANCELED') OR matched_unit_id IS NOT NULL),
 CHECK(source_type <> 'BANK_IMPORT' OR bank_transaction_id IS NOT NULL),
 CHECK(status <> 'ON_HOLD' OR (source_type='BANK_IMPORT' AND hold_reason_encrypted IS NOT NULL)),
 CHECK((status='LINKED') = (linked_payment_id IS NOT NULL)),
 CHECK(linked_payment_id IS NULL OR linked_payment_id <> id)
);
-- 연결용 은행 초안과 취소 이력은 보존하되 동일 원본을 활성 수납으로 두 번 사용할 수 없습니다.
CREATE UNIQUE INDEX payments_active_bank_idx ON payments(bank_transaction_id)
 WHERE bank_transaction_id IS NOT NULL AND status NOT IN ('CANCELED','LINKED');
CREATE INDEX payments_property_date_idx ON payments(property_id,payment_date DESC,id);
CREATE TABLE payment_allocations (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 payment_id uuid NOT NULL,
 charge_id uuid NOT NULL,
 allocated_amount numeric(15,0) NOT NULL CHECK(allocated_amount > 0),
 status varchar(20) NOT NULL CHECK(status IN ('ACTIVE','CANCELED')),
 allocated_by uuid NOT NULL REFERENCES users(id),
 allocated_at timestamptz NOT NULL,
 canceled_by uuid REFERENCES users(id),
 canceled_at timestamptz,
 FOREIGN KEY(property_id,payment_id) REFERENCES payments(property_id,id),
 FOREIGN KEY(property_id,charge_id) REFERENCES charges(property_id,id),
 UNIQUE(payment_id,charge_id),
 CHECK((status='CANCELED') = (canceled_at IS NOT NULL AND canceled_by IS NOT NULL))
);
CREATE INDEX payment_allocations_charge_idx ON payment_allocations(charge_id) WHERE status='ACTIVE';
CREATE TABLE payment_events (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 payment_id uuid NOT NULL,
 action varchar(30) NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),
 reason_encrypted text,
 created_at timestamptz NOT NULL,
 FOREIGN KEY(property_id,payment_id) REFERENCES payments(property_id,id)
);
-- 서비스는 관리대상 잠금으로 동시 확정을 직렬화합니다. DB도 커밋 시 과배분·다른 세대 배분을 거부합니다.
CREATE FUNCTION validate_payment_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p payments%ROWTYPE; c charges%ROWTYPE;
BEGIN
 SELECT * INTO p FROM payments WHERE id=NEW.payment_id;
 SELECT * INTO c FROM charges WHERE id=NEW.charge_id;
 IF NEW.status='ACTIVE' AND (p.status <> 'CONFIRMED' OR c.status <> 'ISSUED'
     OR c.total_amount <= 0 OR p.matched_unit_id <> c.unit_id) THEN
   RAISE EXCEPTION 'Invalid payment allocation' USING ERRCODE='23514';
 END IF;
 IF (SELECT coalesce(sum(allocated_amount),0) FROM payment_allocations WHERE payment_id=p.id AND status='ACTIVE') > p.amount
 OR (SELECT coalesce(sum(allocated_amount),0) FROM payment_allocations WHERE charge_id=c.id AND status='ACTIVE') > c.total_amount THEN
   RAISE EXCEPTION 'Payment allocation exceeds balance' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER payment_allocation_check AFTER INSERT OR UPDATE ON payment_allocations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_payment_allocation();

CREATE FUNCTION protect_allocated_charge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.status <> 'ISSUED' OR NEW.total_amount <> OLD.total_amount)
 AND EXISTS (SELECT 1 FROM payment_allocations a JOIN payments p ON p.id=a.payment_id
             WHERE a.charge_id=NEW.id AND a.status='ACTIVE' AND p.status='CONFIRMED') THEN
   RAISE EXCEPTION 'Cancel applied payment before changing charge' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER allocated_charge_guard BEFORE UPDATE OF status,total_amount ON charges
 FOR EACH ROW EXECUTE FUNCTION protect_allocated_charge();
