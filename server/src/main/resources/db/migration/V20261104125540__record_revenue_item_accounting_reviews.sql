-- 추천 항목 코드·이름을 회계 성격으로 간주하지 않고 관리자가 확인한 동일 항목 ID의 일반 수익만 반영합니다.
CREATE TABLE revenue_accounting_reviews (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES accounting_profiles(property_id),
 source_template_item_id uuid NOT NULL REFERENCES fee_template_items(id),
 recognized boolean NOT NULL,
 revision integer NOT NULL CHECK (revision>0),
 reason_encrypted text NOT NULL,
 confirmed_by uuid NOT NULL REFERENCES users(id),
 confirmed_at timestamptz NOT NULL,
 UNIQUE (property_id,source_template_item_id,revision)
);
CREATE TRIGGER revenue_accounting_reviews_immutable BEFORE UPDATE OR DELETE ON revenue_accounting_reviews
 FOR EACH ROW EXECUTE FUNCTION protect_income_statement_history();

CREATE FUNCTION validate_revenue_accounting_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_property uuid; last_revision integer;
BEGIN
 -- 같은 관리대상의 확인을 직렬화해 SQL 직접 입력도 버전 중복·다른 대상의 부과 항목을 허용하지 않습니다.
 PERFORM 1 FROM accounting_profiles WHERE property_id=NEW.property_id FOR UPDATE;
 SELECT property_id INTO source_property FROM fee_template_items WHERE id=NEW.source_template_item_id;
 SELECT coalesce(max(revision),0) INTO last_revision FROM revenue_accounting_reviews
  WHERE property_id=NEW.property_id AND source_template_item_id=NEW.source_template_item_id;
 IF source_property IS DISTINCT FROM NEW.property_id OR NEW.revision<>last_revision+1 THEN
  RAISE EXCEPTION 'invalid revenue accounting review' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER revenue_accounting_reviews_check BEFORE INSERT ON revenue_accounting_reviews
 FOR EACH ROW EXECUTE FUNCTION validate_revenue_accounting_review();
