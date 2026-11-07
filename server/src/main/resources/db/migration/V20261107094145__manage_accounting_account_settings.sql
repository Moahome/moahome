-- 기본 계정 ID·원천 금액은 유지하고 표시 정보와 사용 상태의 제한된 변경만 허용합니다.
DROP TRIGGER accounting_accounts_immutable ON accounting_accounts;
ALTER TABLE accounting_accounts
 ADD COLUMN default_account boolean NOT NULL DEFAULT false,
 ADD COLUMN active boolean NOT NULL DEFAULT true,
 ADD COLUMN revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 ADD COLUMN changed_by uuid REFERENCES users(id),
 ADD COLUMN changed_at timestamptz,
 ADD COLUMN deleted_at timestamptz;
UPDATE accounting_accounts SET changed_by=created_by,changed_at=created_at,
 default_account=(system_key IS NOT NULL OR
  (code='103' AND report_group='ASSET' AND name='통장간 거래') OR
  (report_group='OPERATING_EXPENSE' AND (code,name) IN
   (('801','일반관리비'),('802','청소비'),('803','엘리베이터비'),('804','수도전기료'),
    ('805','모아홈비'),('806','수선비'),('807','정화조비'),('808','통신비'),
    ('809','지급수수료'),('810','소모품'),('812','보험료'),('813','잡비'))));
ALTER TABLE accounting_accounts ADD CONSTRAINT accounting_accounts_state_check
 CHECK(deleted_at IS NULL OR (NOT active AND NOT default_account));

CREATE TABLE accounting_account_changes (
 account_id uuid NOT NULL REFERENCES accounting_accounts(id),
 revision integer NOT NULL,
 property_id uuid NOT NULL,
 name varchar(100) NOT NULL,
 code varchar(3) NOT NULL,
 report_group varchar(30) NOT NULL,
 active boolean NOT NULL,
 deleted_at timestamptz,
 changed_by uuid NOT NULL REFERENCES users(id),
 changed_at timestamptz NOT NULL,
 PRIMARY KEY(account_id,revision),
 FOREIGN KEY(property_id,account_id) REFERENCES accounting_accounts(property_id,id)
);
INSERT INTO accounting_account_changes
 SELECT id,revision,property_id,name,code,report_group,active,deleted_at,changed_by,changed_at FROM accounting_accounts;
CREATE TRIGGER accounting_account_changes_immutable BEFORE UPDATE OR DELETE ON accounting_account_changes
 FOR EACH ROW EXECUTE FUNCTION protect_income_statement_history();

-- 코드·명칭으로만 조회하던 옛 지출도 설정 변경 전에 당시 계정 ID를 고정합니다.
-- NULL도 보존하여 미분류 원천이 후속 명칭 변경으로 다른 계정에 자동 귀속되지 않게 합니다.
CREATE TABLE accounting_expense_account_links (
 expense_id uuid PRIMARY KEY,
 property_id uuid NOT NULL,
 account_id uuid,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL,
 FOREIGN KEY(property_id,expense_id) REFERENCES expenses(property_id,id),
 FOREIGN KEY(property_id,account_id) REFERENCES accounting_accounts(property_id,id)
);
CREATE INDEX accounting_expense_account_links_account_idx ON accounting_expense_account_links(property_id,account_id);
CREATE TRIGGER accounting_expense_account_links_immutable BEFORE UPDATE OR DELETE ON accounting_expense_account_links
 FOR EACH ROW EXECUTE FUNCTION protect_income_statement_history();

-- 취소·삭제된 업무와 설정도 참조 사용으로 계산하며 표시 정보의 변경 이력 자체는 업무 사용에 포함하지 않습니다.
CREATE FUNCTION accounting_account_is_used(target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM expenses WHERE accounting_account_id=target)
 OR EXISTS(SELECT 1 FROM expense_accounting_reviews WHERE account_id=target)
 OR EXISTS(SELECT 1 FROM fee_template_items WHERE revenue_account_id=target)
 OR EXISTS(SELECT 1 FROM charge_items WHERE revenue_account_id=target)
 OR EXISTS(SELECT 1 FROM bank_transfer_postings WHERE accounting_account_id=target)
 OR EXISTS(SELECT 1 FROM payable_expenses WHERE expense_account_id=target OR payable_account_id=target)
 OR EXISTS(SELECT 1 FROM accounting_expense_account_links WHERE account_id=target)
$$;

CREATE FUNCTION protect_accounting_account_settings() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'account deletion is logical' USING ERRCODE='23514'; END IF;
 PERFORM id FROM properties WHERE id=OLD.property_id FOR UPDATE;
 IF OLD.deleted_at IS NOT NULL OR NEW.revision<>OLD.revision+1 OR NEW.changed_by IS NULL OR NEW.changed_at IS NULL
  OR (to_jsonb(NEW)-ARRAY['name','code','report_group','active','revision','changed_by','changed_at','deleted_at'])
    IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['name','code','report_group','active','revision','changed_by','changed_at','deleted_at'])
  OR (OLD.default_account AND (NEW.name<>OLD.name OR NEW.code<>OLD.code OR NEW.report_group<>OLD.report_group
      OR NEW.deleted_at IS NOT NULL OR (OLD.report_group NOT IN ('OPERATING_EXPENSE','OTHER_EXPENSE') AND NOT NEW.active)))
  OR (accounting_account_is_used(OLD.id) AND (NEW.code<>OLD.code OR NEW.report_group<>OLD.report_group OR NEW.deleted_at IS NOT NULL)) THEN
  RAISE EXCEPTION 'account settings are protected' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER accounting_accounts_settings_guard BEFORE UPDATE OR DELETE ON accounting_accounts
 FOR EACH ROW EXECUTE FUNCTION protect_accounting_account_settings();

CREATE FUNCTION record_accounting_account_change() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 INSERT INTO accounting_account_changes VALUES(NEW.id,NEW.revision,NEW.property_id,NEW.name,NEW.code,
  NEW.report_group,NEW.active,NEW.deleted_at,coalesce(NEW.changed_by,NEW.created_by),coalesce(NEW.changed_at,NEW.created_at));
 RETURN NEW;
END $$;
CREATE TRIGGER accounting_accounts_changes AFTER INSERT OR UPDATE ON accounting_accounts
 FOR EACH ROW EXECUTE FUNCTION record_accounting_account_change();

-- 모든 신규 연결을 같은 관리대상 잠금으로 직렬화하여 중지·삭제 직후의 새 업무 연결을 거부합니다.
-- 기존 연결을 그대로 사용하는 지급 정산과 과거 조회에는 이 신규 연결 검사를 적용하지 않습니다.
CREATE FUNCTION validate_selectable_accounting_account() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE selected uuid;
BEGIN
 PERFORM id FROM properties WHERE id=NEW.property_id FOR UPDATE;
 selected=CASE TG_TABLE_NAME WHEN 'expenses' THEN (to_jsonb(NEW)->>'accounting_account_id')::uuid
  WHEN 'expense_accounting_reviews' THEN (to_jsonb(NEW)->>'account_id')::uuid
  WHEN 'payable_expenses' THEN (to_jsonb(NEW)->>'expense_account_id')::uuid
  ELSE (to_jsonb(NEW)->>'revenue_account_id')::uuid END;
 IF selected IS NOT NULL AND NOT EXISTS(SELECT 1 FROM accounting_accounts WHERE property_id=NEW.property_id
  AND id=selected AND active AND deleted_at IS NULL) THEN
  RAISE EXCEPTION 'account is not selectable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER expenses_active_account BEFORE INSERT ON expenses FOR EACH ROW EXECUTE FUNCTION validate_selectable_accounting_account();
CREATE TRIGGER expense_reviews_active_account BEFORE INSERT ON expense_accounting_reviews FOR EACH ROW EXECUTE FUNCTION validate_selectable_accounting_account();
CREATE TRIGGER payable_expenses_active_account BEFORE INSERT ON payable_expenses FOR EACH ROW EXECUTE FUNCTION validate_selectable_accounting_account();
CREATE TRIGGER fee_items_active_account BEFORE INSERT OR UPDATE OF revenue_account_id ON fee_template_items FOR EACH ROW EXECUTE FUNCTION validate_selectable_accounting_account();
CREATE TRIGGER charge_items_active_account BEFORE INSERT OR UPDATE OF revenue_account_id ON charge_items FOR EACH ROW EXECUTE FUNCTION validate_selectable_accounting_account();
