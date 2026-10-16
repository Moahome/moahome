-- 이미 적용된 기타 입금 Migration은 유지하고 함수의 참조 스키마를 후속 변경으로 고정합니다.
-- 다른 스키마에서 호출해도 해당 관리 원장의 배분 제약을 검증하도록 보장합니다.
ALTER FUNCTION validate_payment_allocation() SET search_path FROM CURRENT;
ALTER FUNCTION protect_other_income_allocation() SET search_path FROM CURRENT;
