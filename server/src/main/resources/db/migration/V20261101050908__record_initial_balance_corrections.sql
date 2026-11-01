-- 초기 기준일·통장 및 동별 시작 금액 정정의 전후 값과 사유를 원천 변경과 같은 트랜잭션에 보관합니다.
-- 기존 인계·동별 잔고·거래의 금액과 날짜는 이 Migration에서 변경하지 않습니다.
CREATE TABLE initial_balance_changes (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 kind varchar(30) NOT NULL CHECK (kind IN ('HANDOVER','BUILDING','ACCOUNT')),
 request_body text NOT NULL,
 previous_date date,
 new_date date,
 details text NOT NULL,
 reason varchar(500) NOT NULL CHECK (length(trim(reason))>0),
 changed_by uuid NOT NULL REFERENCES users(id),
 changed_at timestamptz NOT NULL
);
CREATE INDEX initial_balance_changes_property_idx ON initial_balance_changes(property_id,changed_at DESC,id);
-- 정정의 재시도 식별과 변경 전후 값이 나중에 덮어써지거나 사라지지 않도록 합니다.
CREATE TRIGGER initial_balance_changes_immutable BEFORE UPDATE OR DELETE ON initial_balance_changes
 FOR EACH ROW EXECUTE FUNCTION protect_cash_balance_history();
