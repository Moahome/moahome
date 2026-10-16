-- 과거 부과 등록은 자동 스케줄 실행과 구분하고 실제 등록 처리자를 함께 보존합니다.
ALTER TABLE billing_periods ADD COLUMN recorded_by uuid REFERENCES users(id);
ALTER TABLE billing_periods DROP CONSTRAINT billing_periods_confirmation_source_check;
ALTER TABLE billing_periods ADD CONSTRAINT billing_periods_confirmation_source_check
    CHECK (confirmation_source IN ('SCHEDULE', 'HISTORY'));
ALTER TABLE billing_periods ADD CONSTRAINT billing_periods_history_actor_check
    CHECK ((confirmation_source = 'HISTORY') = (recorded_by IS NOT NULL));
