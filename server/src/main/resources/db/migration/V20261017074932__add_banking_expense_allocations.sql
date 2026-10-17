-- 기존 입금 ID·중복 키·수납 연결을 보존하고 출금 방향을 후속 확장합니다.
ALTER TABLE bank_transactions ADD COLUMN direction varchar(20) NOT NULL DEFAULT 'INCOME' CHECK(direction IN ('INCOME','EXPENSE'));
CREATE TABLE expenses (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 bank_transaction_id uuid NOT NULL UNIQUE,
 category_encrypted text NOT NULL,
 memo_encrypted text,
 total_amount numeric(15,0) NOT NULL CHECK(total_amount>0),
 allocation_mode varchar(20) NOT NULL CHECK(allocation_mode IN ('EQUAL','RATIO','AMOUNT')),
 save_as_rule boolean NOT NULL,
 rule_key char(64) NOT NULL,
 confirmed_by uuid NOT NULL REFERENCES users(id),
 confirmed_at timestamptz NOT NULL,
 UNIQUE(property_id,id),
 FOREIGN KEY(property_id,bank_transaction_id) REFERENCES bank_transactions(property_id,id)
);
CREATE INDEX expenses_property_idx ON expenses(property_id,confirmed_at DESC);
CREATE TABLE expense_allocations (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 expense_id uuid NOT NULL,
 building_id uuid,
 target_label_encrypted text NOT NULL,
 allocated_amount numeric(15,0) NOT NULL CHECK(allocated_amount>0),
 percentage numeric(5,2) CHECK(percentage>0 AND percentage<=100),
 sort_order integer NOT NULL CHECK(sort_order>=0),
 FOREIGN KEY(property_id,expense_id) REFERENCES expenses(property_id,id),
 FOREIGN KEY(property_id,building_id) REFERENCES buildings(property_id,id),
 UNIQUE(expense_id,sort_order)
);
CREATE UNIQUE INDEX expense_allocations_building_idx ON expense_allocations(expense_id,building_id) WHERE building_id IS NOT NULL;
-- 저장 중간의 합계는 허용하고 커밋 직전에 원본·지출·배분 금액의 일치를 검사합니다.
CREATE FUNCTION validate_expense_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE selected_id uuid; item expenses%ROWTYPE; original bank_transactions%ROWTYPE; allocated numeric; ratios numeric;
BEGIN
 IF TG_TABLE_NAME='expenses' THEN selected_id=COALESCE(NEW.id,OLD.id);
 ELSE selected_id=COALESCE(NEW.expense_id,OLD.expense_id); END IF;
 SELECT * INTO item FROM expenses WHERE id=selected_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO original FROM bank_transactions WHERE id=item.bank_transaction_id;
 IF original.direction<>'EXPENSE' OR original.deleted_at IS NOT NULL OR original.amount<>item.total_amount THEN
  RAISE EXCEPTION 'invalid expense source' USING ERRCODE='23514';
 END IF;
 SELECT COALESCE(sum(allocated_amount),0),COALESCE(sum(percentage),0) INTO allocated,ratios FROM expense_allocations WHERE expense_id=selected_id;
 IF allocated<>item.total_amount OR (item.allocation_mode='RATIO' AND ratios<>100) THEN
  RAISE EXCEPTION 'invalid expense allocation sum' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM expense_allocations WHERE expense_id=selected_id AND
  ((item.allocation_mode='RATIO' AND (percentage IS NULL OR allocated_amount<>item.total_amount*percentage/100)) OR
   (item.allocation_mode<>'RATIO' AND percentage IS NOT NULL))) THEN
  RAISE EXCEPTION 'invalid expense allocation percentage' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER expenses_allocation_check AFTER INSERT OR UPDATE ON expenses DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_expense_allocation();
CREATE CONSTRAINT TRIGGER expense_parts_check AFTER INSERT OR UPDATE OR DELETE ON expense_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_expense_allocation();
-- 수납이 출금 원본을 참조하는 혼선을 DB에서도 차단합니다.
CREATE FUNCTION validate_payment_direction() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF NEW.bank_transaction_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bank_transactions WHERE id=NEW.bank_transaction_id AND direction='INCOME') THEN
  RAISE EXCEPTION 'invalid payment source direction' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payments_direction_check BEFORE INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION validate_payment_direction();
