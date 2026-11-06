-- 회계 시작 설정 전의 초기·운영 지출도 최초 선택 과목을 보존합니다.
-- 기존 지출은 NULL로 유지해 기존 자동 매칭·명시적 회계 정정 이력을 변경하지 않습니다.
ALTER TABLE expenses ADD COLUMN accounting_account_id uuid;
ALTER TABLE expenses ADD CONSTRAINT expenses_accounting_account_fk
 FOREIGN KEY (property_id, accounting_account_id) REFERENCES accounting_accounts(property_id, id);

-- 같은 대상의 계정 FK에 더해 비용 과목만 연결하도록 직접 SQL 입력에도 제약을 적용합니다.
-- 원본 수정·삭제 금지 트리거는 유지하며 이후 과목 정정은 기존 회계 분류 이력을 사용합니다.
CREATE FUNCTION validate_expense_account_selection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.accounting_account_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM accounting_accounts WHERE property_id=NEW.property_id AND id=NEW.accounting_account_id
   AND report_group IN ('OPERATING_EXPENSE','OTHER_EXPENSE')
 ) THEN
  RAISE EXCEPTION 'invalid expense account selection' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER expenses_account_selection_check BEFORE INSERT ON expenses
 FOR EACH ROW EXECUTE FUNCTION validate_expense_account_selection();
