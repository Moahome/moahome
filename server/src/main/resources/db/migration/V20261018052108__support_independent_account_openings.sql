-- 세대 인계 batch에 묶인 통장 잔액을 확장해, 나중에 추가한 통장도 독립 기준일로 등록합니다.
ALTER TABLE bank_opening_balances
 ALTER COLUMN batch_id DROP NOT NULL,
 ADD COLUMN cutoff_date date,
 ADD COLUMN revision bigint NOT NULL DEFAULT 0,
 ADD COLUMN recorded_by uuid REFERENCES users(id),
 ADD COLUMN recorded_at timestamptz;
UPDATE bank_opening_balances o SET cutoff_date=b.cutoff_date,recorded_by=b.created_by,recorded_at=b.created_at
 FROM opening_balance_batches b WHERE b.id=o.batch_id AND b.property_id=o.property_id;
ALTER TABLE bank_opening_balances
 ALTER COLUMN cutoff_date SET NOT NULL,
 ALTER COLUMN recorded_by SET NOT NULL,
 ALTER COLUMN recorded_at SET NOT NULL,
 ADD CONSTRAINT bank_opening_source_check CHECK((batch_id IS NOT NULL AND revision=0) OR (batch_id IS NULL AND revision>0));
CREATE UNIQUE INDEX bank_opening_revision_idx ON bank_opening_balances(property_id,bank_account_id,revision) WHERE batch_id IS NULL;
-- 독립 등록·정정은 새 버전으로 기록합니다. 기존 인계 초안의 편집·삭제 흐름은 유지합니다.
CREATE FUNCTION protect_independent_bank_opening() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF OLD.batch_id IS NULL OR (TG_OP='UPDATE' AND NEW.batch_id IS NULL) THEN
  RAISE EXCEPTION 'independent bank opening history is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bank_opening_history_guard BEFORE UPDATE OR DELETE ON bank_opening_balances
 FOR EACH ROW EXECUTE FUNCTION protect_independent_bank_opening();
