-- 회계 시작 전 귀속인 과거 지출도 사실관계를 확인해 미처리에서 해소할 수 있습니다.
-- 확인 저장 자체가 비용 인식은 아니며 손익 조회는 별도로 회계 시작 월 이후의 기간만 허용합니다.
CREATE OR REPLACE FUNCTION validate_expense_accounting_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE start_date date; last_revision integer; selected_group varchar(30);
BEGIN
 SELECT start_month INTO start_date FROM accounting_profiles WHERE property_id=NEW.property_id FOR UPDATE;
 SELECT report_group INTO selected_group FROM accounting_accounts
  WHERE property_id=NEW.property_id AND id=NEW.account_id;
 SELECT coalesce(max(revision),0) INTO last_revision FROM expense_accounting_reviews
  WHERE property_id=NEW.property_id AND expense_id=NEW.expense_id;
 IF start_date IS NULL OR selected_group IS NULL
  OR selected_group NOT IN ('OPERATING_EXPENSE','OTHER_EXPENSE') OR NEW.revision<>last_revision+1 THEN
  RAISE EXCEPTION 'invalid expense accounting review' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
