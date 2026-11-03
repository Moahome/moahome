-- 동 구분이 없는 관리대상의 공용 지출은 배분 입력·배분 레코드 없이 전액 저장합니다.
ALTER TABLE expenses DROP CONSTRAINT expenses_allocation_mode_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_allocation_mode_check CHECK(allocation_mode IN ('EQUAL','RATIO','AMOUNT','PROPERTY'));

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
 -- 동 없는 관리대상은 지출 전액을 부모 기록에 두며 가상 동·외부 부담액을 만들지 않습니다.
 IF item.allocation_mode='PROPERTY' THEN
  IF part_count<>0 OR NOT EXISTS(SELECT 1 FROM properties WHERE id=item.property_id AND has_buildings=false) THEN
   RAISE EXCEPTION 'invalid property expense scope' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
 END IF;
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
