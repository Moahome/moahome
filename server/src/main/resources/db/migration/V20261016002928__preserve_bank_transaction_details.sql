-- 적용된 입금 초기 Migration을 유지하고 은행 원본의 선택 정보를 후속 변경으로 추가합니다.
-- 기존 거래의 시간·잔액은 알 수 없으므로 NULL을 유지하며 입금액과 수납·배분은 변경하지 않습니다.
ALTER TABLE bank_transactions
 ADD COLUMN transaction_time time,
 ADD COLUMN balance numeric(15,0);

-- 같은 이름의 다른 스키마 테이블을 잘못 참조하지 않도록 Migration 적용 스키마를 함수에 고정합니다.
-- 함수 본문과 기존 제약·트리거를 보존하므로 과거 수납의 무결성 검사도 계속 적용됩니다.
ALTER FUNCTION validate_payment_allocation() SET search_path FROM CURRENT;
ALTER FUNCTION protect_allocated_charge() SET search_path FROM CURRENT;
