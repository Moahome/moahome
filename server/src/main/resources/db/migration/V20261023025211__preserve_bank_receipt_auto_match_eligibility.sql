-- 기존 수납과 수동 입력의 매칭 기준은 유지합니다. 신규 은행 원본의 상대 미확인·음수 출금은
-- 최초 가져오기와 이후 일치 입금 일괄 처리 모두에서 자동 세대 수납을 제외할 근거를 저장합니다.
-- 기존 행은 true로 보존하고 금액·상태·원본 연결·충당 이력을 변경하지 않습니다.
ALTER TABLE payments ADD COLUMN auto_match_eligible boolean NOT NULL DEFAULT true;
