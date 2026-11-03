-- 기준일까지 입금도 원본·용도를 보존하되 기존 미수에 다시 충당되는 일반 확정 수납과 구분합니다.
DO $$
DECLARE item record;
BEGIN
 FOR item IN SELECT conname FROM pg_constraint WHERE conrelid='payments'::regclass AND contype='c'
  AND ((pg_get_constraintdef(oid) LIKE '%PENDING%' AND pg_get_constraintdef(oid) LIKE '%ON_HOLD%')
   OR (pg_get_constraintdef(oid) LIKE '%confirmed_at%' AND pg_get_constraintdef(oid) LIKE '%confirmed_by%')) LOOP
  EXECUTE format('ALTER TABLE payments DROP CONSTRAINT %I',item.conname);
 END LOOP;
END $$;
ALTER TABLE payments
 ADD CONSTRAINT payments_status_check CHECK(status IN ('PENDING','ON_HOLD','CONFIRMED','CANCELED','LINKED','OPENING')),
 ADD CONSTRAINT payments_confirmation_check CHECK((status IN ('CONFIRMED','CANCELED','OPENING')) = (confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL));
ALTER TABLE payments DROP CONSTRAINT payments_receipt_shape_check;
ALTER TABLE payments ADD CONSTRAINT payments_receipt_shape_check CHECK(
 (receipt_type='HOUSEHOLD' AND income_category_encrypted IS NULL AND income_note_encrypted IS NULL
  AND (source_type='BANK_IMPORT' OR manual_purpose='HOUSEHOLD')
  AND (status NOT IN ('CONFIRMED','CANCELED','OPENING') OR matched_unit_id IS NOT NULL))
 OR (receipt_type='OTHER' AND status IN ('CONFIRMED','CANCELED','OPENING')
  AND (source_type='BANK_IMPORT' OR (source_type='MANUAL' AND manual_purpose IN ('OTHER','SHARED')))
  AND matched_unit_id IS NULL AND payer_resident_id IS NULL AND income_category_encrypted IS NOT NULL)
);

-- 과거 입금을 일반 수납으로 바꿔 다시 충당하거나 기준일 이후 거래를 이 상태로 숨기지 못하게 합니다.
CREATE FUNCTION validate_opening_payment() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.status='OPENING' AND NEW.status<>'OPENING' THEN
  RAISE EXCEPTION 'opening payment state is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.status='OPENING' AND (NEW.source_type<>'BANK_IMPORT' OR NEW.bank_transaction_id IS NULL
  OR NOT EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND balance_cutoff_date>=NEW.payment_date)
  OR EXISTS(SELECT 1 FROM payment_allocations WHERE payment_id=NEW.id AND status='ACTIVE')) THEN
  RAISE EXCEPTION 'invalid opening payment' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payments_opening_state BEFORE INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION validate_opening_payment();

-- 공동 입금의 과거 배분은 보존하되 외부 부담금의 신규 회수로는 사용할 수 없습니다.
CREATE OR REPLACE FUNCTION validate_income_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE receipt payments%ROWTYPE; total numeric; ratios numeric; mode_count integer; mode text;
BEGIN
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 SELECT * INTO receipt FROM payments WHERE id=NEW.payment_id AND property_id=NEW.property_id;
 IF receipt.status NOT IN ('CONFIRMED','OPENING') OR receipt.receipt_type<>'OTHER' OR receipt.deleted_at IS NOT NULL
  OR NOT ((receipt.bank_transaction_id IS NULL AND receipt.source_type='MANUAL' AND receipt.manual_purpose='SHARED')
   OR EXISTS(SELECT 1 FROM bank_transactions WHERE id=receipt.bank_transaction_id AND direction='INCOME' AND deleted_at IS NULL AND amount=receipt.amount))
  OR EXISTS(SELECT 1 FROM external_settlement_links WHERE payment_id=receipt.id) THEN
  RAISE EXCEPTION 'invalid distributed income source' USING ERRCODE='23514';
 END IF;
 SELECT sum(amount),sum(percentage),count(DISTINCT allocation_mode),min(allocation_mode) INTO total,ratios,mode_count,mode
  FROM income_allocations WHERE payment_id=NEW.payment_id;
 IF total<>receipt.amount OR mode_count<>1 OR (mode='RATIO' AND COALESCE(ratios,0)<>100)
  OR EXISTS(SELECT 1 FROM income_allocations WHERE payment_id=NEW.payment_id AND
   ((mode='RATIO' AND (percentage IS NULL OR amount<>receipt.amount*percentage/100))
    OR (mode<>'RATIO' AND percentage IS NOT NULL)
    OR (mode='EQUAL' AND amount<>receipt.amount/(SELECT count(*) FROM income_allocations WHERE payment_id=NEW.payment_id)))) THEN
  RAISE EXCEPTION 'invalid distributed income sum' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;

CREATE TABLE opening_payment_snapshots (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 opening_item_id uuid NOT NULL,
 month varchar(7) NOT NULL CHECK(month ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$'),
 billed numeric(15,0) NOT NULL CHECK(billed>0),
 paid numeric(15,0) NOT NULL CHECK(paid>=0 AND paid<=billed),
 UNIQUE(opening_item_id),
 FOREIGN KEY(property_id,opening_item_id) REFERENCES opening_balance_items(property_id,id)
);

-- 기존 월 청구의 남은 미납은 인계 미수 안에 있어야 합니다. 새 채무를 따로 생성하지 않습니다.
CREATE FUNCTION validate_opening_payment_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM opening_balance_items i JOIN opening_balance_batches b ON b.id=i.batch_id
  WHERE i.id=NEW.opening_item_id AND i.property_id=NEW.property_id AND b.status='CONFIRMED'
   AND NEW.month=to_char(b.cutoff_date,'YYYY-MM') AND NEW.billed-NEW.paid<=i.receivable) THEN
  RAISE EXCEPTION 'invalid opening payment snapshot' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER opening_payment_snapshot_check BEFORE INSERT OR UPDATE ON opening_payment_snapshots
 FOR EACH ROW EXECUTE FUNCTION validate_opening_payment_snapshot();
