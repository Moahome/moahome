-- 수동 등록 당시 용도를 보존합니다. 기존 수동 수납은 기존 세대 지정 흐름을 그대로 유지합니다.
ALTER TABLE payments ADD COLUMN manual_purpose varchar(20);
UPDATE payments SET manual_purpose='HOUSEHOLD' WHERE source_type='MANUAL';
ALTER TABLE payments ADD CONSTRAINT payments_manual_purpose_check CHECK(
 (source_type='MANUAL' AND manual_purpose IS NOT NULL AND manual_purpose IN ('HOUSEHOLD','OTHER','SHARED'))
 OR (source_type='BANK_IMPORT' AND manual_purpose IS NULL)
);
ALTER TABLE payments DROP CONSTRAINT payments_receipt_shape_check;
ALTER TABLE payments ADD CONSTRAINT payments_receipt_shape_check CHECK(
 (receipt_type='HOUSEHOLD' AND income_category_encrypted IS NULL AND income_note_encrypted IS NULL
  AND (source_type='BANK_IMPORT' OR manual_purpose IN ('HOUSEHOLD'))
  AND (status NOT IN ('CONFIRMED','CANCELED') OR matched_unit_id IS NOT NULL))
 OR (receipt_type='OTHER' AND status IN ('CONFIRMED','CANCELED')
  AND (source_type='BANK_IMPORT' OR (source_type='MANUAL' AND manual_purpose IN ('OTHER','SHARED')))
  AND matched_unit_id IS NULL AND payer_resident_id IS NULL AND income_category_encrypted IS NOT NULL)
);
-- 수동 공동 입금은 확인한 입금액 자체를 배분합니다. 은행 파일 원본·확인 잔액은 생성하지 않습니다.
CREATE OR REPLACE FUNCTION validate_income_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE receipt payments%ROWTYPE; total numeric; ratios numeric; mode_count integer; mode text;
BEGIN
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 SELECT * INTO receipt FROM payments WHERE id=NEW.payment_id AND property_id=NEW.property_id;
 IF receipt.status<>'CONFIRMED' OR receipt.receipt_type<>'OTHER' OR receipt.deleted_at IS NOT NULL
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

-- 외부 분담금도 같은 실제 통장의 수동 기타 입금에서 회수 연결할 수 있습니다.
CREATE OR REPLACE FUNCTION validate_external_settlement_link() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE part expense_allocations%ROWTYPE; receipt payments%ROWTYPE; expense_account uuid;
BEGIN
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 SELECT * INTO part FROM expense_allocations WHERE id=NEW.allocation_id AND property_id=NEW.property_id;
 SELECT * INTO receipt FROM payments WHERE id=NEW.payment_id AND property_id=NEW.property_id;
 SELECT b.bank_account_id INTO expense_account FROM expenses e JOIN bank_transactions b ON b.id=e.bank_transaction_id WHERE e.id=part.expense_id;
 IF part.building_id IS NOT NULL OR receipt.status<>'CONFIRMED' OR receipt.receipt_type<>'OTHER' OR receipt.deleted_at IS NOT NULL
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
