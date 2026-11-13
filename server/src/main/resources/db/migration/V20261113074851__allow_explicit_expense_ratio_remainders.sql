-- 기존 확정 자료는 변경하지 않고 비율·원 단위 금액을 함께 보존한 명시적 나머지 배분만 허용합니다.
CREATE OR REPLACE FUNCTION validate_expense_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE selected_id uuid; item expenses%ROWTYPE; original bank_transactions%ROWTYPE;
 allocated numeric; ratios numeric; part_count integer; base_total numeric; remainder_amount numeric; adjusted_count integer;
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
  IF TG_TABLE_NAME='expenses' AND TG_OP='INSERT' AND original.deleted_at IS NOT NULL THEN
   RAISE EXCEPTION 'removed expense source' USING ERRCODE='23514';
  END IF;
 END IF;
 SELECT COALESCE(sum(allocated_amount),0),COALESCE(sum(percentage),0),count(*)
 INTO allocated,ratios,part_count FROM expense_allocations WHERE expense_id=selected_id;
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
 -- 소수점 이하는 절사하고 남은 정수 원의 전액을 한 부담처에 더한 경우만 허용합니다.
 -- 합계만 맞추기 위한 임의 금액 이동·여러 부담처로의 나머지 분산은 커밋 시 거부합니다.
 IF item.allocation_mode='RATIO' THEN
  SELECT sum(trunc(item.total_amount*percentage/100)),
   count(*) FILTER(WHERE allocated_amount<>trunc(item.total_amount*percentage/100))
  INTO base_total,adjusted_count FROM expense_allocations WHERE expense_id=selected_id;
  remainder_amount=item.total_amount-base_total;
  IF (remainder_amount=0 AND adjusted_count<>0) OR (remainder_amount>0 AND adjusted_count<>1)
   OR EXISTS(SELECT 1 FROM expense_allocations WHERE expense_id=selected_id AND
    (percentage IS NULL OR allocated_amount NOT IN
     (trunc(item.total_amount*percentage/100),trunc(item.total_amount*percentage/100)+remainder_amount))) THEN
   RAISE EXCEPTION 'invalid expense ratio remainder' USING ERRCODE='23514';
  END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM expense_allocations WHERE expense_id=selected_id AND
  ((item.allocation_mode<>'RATIO' AND percentage IS NOT NULL) OR
   (item.allocation_mode='EQUAL' AND allocated_amount*part_count<>item.total_amount))) THEN
  RAISE EXCEPTION 'invalid expense allocation percentage' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
