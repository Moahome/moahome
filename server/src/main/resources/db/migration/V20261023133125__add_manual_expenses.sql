-- 기존 지출의 원본·ID·배분을 보존하고 실제 통장·출금일을 지출 자체에도 기록합니다.
-- 불변 트리거는 이 트랜잭션의 보정 동안만 해제하며 실패하면 DDL과 보정이 함께 롤백됩니다.
ALTER TABLE expenses ADD COLUMN source_type varchar(20) NOT NULL DEFAULT 'BANK_IMPORT';
ALTER TABLE expenses ADD COLUMN bank_account_id uuid;
ALTER TABLE expenses ADD COLUMN expense_date date;
ALTER TABLE expenses DISABLE TRIGGER expenses_immutable;
ALTER TABLE expenses DISABLE TRIGGER expenses_allocation_check;
UPDATE expenses e SET bank_account_id=b.bank_account_id, expense_date=b.transaction_date
 FROM bank_transactions b WHERE b.id=e.bank_transaction_id;
ALTER TABLE expenses ENABLE TRIGGER expenses_immutable;
ALTER TABLE expenses ENABLE TRIGGER expenses_allocation_check;
ALTER TABLE expenses ALTER COLUMN bank_account_id SET NOT NULL;
ALTER TABLE expenses ALTER COLUMN expense_date SET NOT NULL;
ALTER TABLE expenses ALTER COLUMN bank_transaction_id DROP NOT NULL;
ALTER TABLE expenses ALTER COLUMN rule_key DROP NOT NULL;
ALTER TABLE expenses ADD CONSTRAINT expenses_account_fk FOREIGN KEY(property_id,bank_account_id)
 REFERENCES bank_accounts(property_id,id);
ALTER TABLE expenses ADD CONSTRAINT expenses_source_check CHECK(
 (source_type='BANK_IMPORT' AND bank_transaction_id IS NOT NULL AND rule_key IS NOT NULL)
 OR (source_type='MANUAL' AND bank_transaction_id IS NULL AND rule_key IS NULL AND NOT save_as_rule));
CREATE INDEX expenses_account_date_idx ON expenses(property_id,bank_account_id,expense_date);

-- 수동 출금에도 배분 전액·비율·균등 금액을 검증하고 은행 지출은 기존 원본 무결성을 유지합니다.
CREATE OR REPLACE FUNCTION validate_expense_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE selected_id uuid; item expenses%ROWTYPE; original bank_transactions%ROWTYPE;
 allocated numeric; ratios numeric; part_count integer;
BEGIN
 IF TG_TABLE_NAME='expenses' THEN selected_id=COALESCE(NEW.id,OLD.id);
 ELSE selected_id=COALESCE(NEW.expense_id,OLD.expense_id); END IF;
 SELECT * INTO item FROM expenses WHERE id=selected_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF item.source_type='BANK_IMPORT' THEN
  SELECT * INTO original FROM bank_transactions WHERE id=item.bank_transaction_id;
  IF NOT FOUND OR original.direction<>'EXPENSE' OR original.amount<>item.total_amount
   OR original.property_id<>item.property_id OR original.bank_account_id<>item.bank_account_id
   OR original.transaction_date<>item.expense_date THEN
   RAISE EXCEPTION 'invalid expense source' USING ERRCODE='23514';
  END IF;
  -- 삭제된 과거 원본도 확정 이력은 유지합니다. 신규 확정만 활성 원본을 요구합니다.
  IF TG_TABLE_NAME='expenses' AND TG_OP='INSERT' AND original.deleted_at IS NOT NULL THEN
   RAISE EXCEPTION 'removed expense source' USING ERRCODE='23514';
  END IF;
 END IF;
 SELECT COALESCE(sum(allocated_amount),0),COALESCE(sum(percentage),0),count(*)
 INTO allocated,ratios,part_count FROM expense_allocations WHERE expense_id=selected_id;
 IF part_count<1 OR part_count>100 OR allocated<>item.total_amount
  OR (item.allocation_mode='RATIO' AND ratios<>100) THEN
  RAISE EXCEPTION 'invalid expense allocation sum' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM expense_allocations WHERE expense_id=selected_id AND
  ((item.allocation_mode='RATIO' AND (percentage IS NULL OR allocated_amount<>item.total_amount*percentage/100)) OR
   (item.allocation_mode<>'RATIO' AND percentage IS NOT NULL) OR
   (item.allocation_mode='EQUAL' AND allocated_amount*part_count<>item.total_amount))) THEN
  RAISE EXCEPTION 'invalid expense allocation percentage' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;

-- 원본의 날짜·통장을 바꿔 확정 지출의 귀속을 우회하지 못하게 하며 기존 선택 삭제 감사는 허용합니다.
CREATE OR REPLACE FUNCTION protect_expense_bank_source() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM expenses WHERE bank_transaction_id=OLD.id) AND
  (NEW.direction<>'EXPENSE' OR NEW.amount<>OLD.amount OR NEW.property_id<>OLD.property_id
   OR NEW.bank_account_id<>OLD.bank_account_id OR NEW.transaction_date<>OLD.transaction_date
   OR (NEW.deleted_at IS NOT NULL AND NEW.deleted_by IS NULL)) THEN
  RAISE EXCEPTION 'confirmed expense source is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

-- 수동 지출의 외부 부담분도 기존 회수 한도와 같은 통장 조건을 적용합니다.
CREATE OR REPLACE FUNCTION validate_external_settlement_link() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE part expense_allocations%ROWTYPE; receipt payments%ROWTYPE; expense_account uuid;
BEGIN
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 SELECT * INTO part FROM expense_allocations WHERE id=NEW.allocation_id AND property_id=NEW.property_id;
 SELECT * INTO receipt FROM payments WHERE id=NEW.payment_id AND property_id=NEW.property_id;
 SELECT e.bank_account_id INTO expense_account FROM expenses e WHERE e.id=part.expense_id AND e.property_id=NEW.property_id;
 IF part.id IS NULL OR receipt.id IS NULL OR expense_account IS NULL OR part.building_id IS NOT NULL OR receipt.status<>'CONFIRMED' OR receipt.receipt_type<>'OTHER' OR receipt.deleted_at IS NOT NULL
  OR (receipt.bank_transaction_id IS NULL AND NOT (receipt.source_type='MANUAL' AND receipt.manual_purpose='OTHER'))
  OR receipt.bank_account_id<>expense_account THEN
  RAISE EXCEPTION 'invalid external settlement source' USING ERRCODE='23514';
 END IF;
 IF (SELECT COALESCE(sum(l.amount),0) FROM external_settlement_links l JOIN payments p ON p.id=l.payment_id
     WHERE l.allocation_id=NEW.allocation_id AND p.status='CONFIRMED' AND p.deleted_at IS NULL)>part.allocated_amount
 OR (SELECT COALESCE(sum(amount),0) FROM external_settlement_links WHERE payment_id=NEW.payment_id)>receipt.amount THEN
  RAISE EXCEPTION 'external settlement exceeds source amount' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
