-- 회계 시작 기준·손익 과목·확인한 지출 귀속만 추가합니다. 기존 청구·입출금·인계 금액을 바꾸지 않습니다.
CREATE TABLE accounting_profiles (
 property_id uuid PRIMARY KEY REFERENCES properties(id),
 start_month date NOT NULL CHECK (extract(day FROM start_month)=1),
 fiscal_year_start_month integer NOT NULL CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL
);

CREATE TABLE accounting_accounts (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 name varchar(100) NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
 report_group varchar(30) NOT NULL CHECK (report_group IN
  ('OPERATING_REVENUE','OPERATING_EXPENSE','OTHER_REVENUE','OTHER_EXPENSE')),
 system_key varchar(40),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL,
 UNIQUE (property_id,id),
 UNIQUE (property_id,report_group,name),
 UNIQUE (property_id,system_key),
 CHECK (system_key IS NULL OR (system_key='MANAGEMENT_REVENUE' AND report_group='OPERATING_REVENUE'))
);

CREATE TABLE expense_accounting_reviews (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES accounting_profiles(property_id),
 expense_id uuid NOT NULL,
 account_id uuid NOT NULL,
 recognition_month date NOT NULL CHECK (extract(day FROM recognition_month)=1),
 revision integer NOT NULL CHECK (revision>0),
 reason_encrypted text NOT NULL,
 confirmed_by uuid NOT NULL REFERENCES users(id),
 confirmed_at timestamptz NOT NULL,
 FOREIGN KEY (property_id,expense_id) REFERENCES expenses(property_id,id),
 FOREIGN KEY (property_id,account_id) REFERENCES accounting_accounts(property_id,id),
 UNIQUE (property_id,expense_id,revision)
);
CREATE INDEX expense_accounting_month_idx ON expense_accounting_reviews(property_id,recognition_month);

-- 과목과 시작 기준은 이번 조회 연결에서 직접 수정·삭제하지 않습니다. 지출 정정은 새 revision을 추가합니다.
CREATE FUNCTION protect_income_statement_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'income statement history is immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER accounting_profiles_immutable BEFORE UPDATE OR DELETE ON accounting_profiles
 FOR EACH ROW EXECUTE FUNCTION protect_income_statement_history();
CREATE TRIGGER accounting_accounts_immutable BEFORE UPDATE OR DELETE ON accounting_accounts
 FOR EACH ROW EXECUTE FUNCTION protect_income_statement_history();
CREATE TRIGGER expense_accounting_reviews_immutable BEFORE UPDATE OR DELETE ON expense_accounting_reviews
 FOR EACH ROW EXECUTE FUNCTION protect_income_statement_history();

-- 같은 대상의 비용 과목·시작 월·연속 revision을 DB에서도 확인해 직접 SQL의 우회를 막습니다.
CREATE FUNCTION validate_expense_accounting_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE start_date date; last_revision integer; selected_group varchar(30);
BEGIN
 SELECT start_month INTO start_date FROM accounting_profiles WHERE property_id=NEW.property_id FOR UPDATE;
 SELECT report_group INTO selected_group FROM accounting_accounts
  WHERE property_id=NEW.property_id AND id=NEW.account_id;
 SELECT coalesce(max(revision),0) INTO last_revision FROM expense_accounting_reviews
  WHERE property_id=NEW.property_id AND expense_id=NEW.expense_id;
 IF start_date IS NULL OR NEW.recognition_month<start_date OR selected_group IS NULL
  OR selected_group NOT IN ('OPERATING_EXPENSE','OTHER_EXPENSE') OR NEW.revision<>last_revision+1 THEN
  RAISE EXCEPTION 'invalid expense accounting review' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER expense_accounting_reviews_check BEFORE INSERT ON expense_accounting_reviews
 FOR EACH ROW EXECUTE FUNCTION validate_expense_accounting_review();
