-- 잔고를 등록한 당시 공용 통장이 하나였다면 나중에 추가된 통장 때문에 기존 확정값을 잃지 않게 합니다.
-- 현재 기본 통장을 추측하지 않고 등록 시각의 통장 수로 소속이 유일한 값만 이전합니다.
ALTER TABLE building_cash_openings DISABLE TRIGGER building_cash_openings_change_check;
ALTER TABLE building_cash_opening_changes DISABLE TRIGGER cash_opening_changes_immutable;
UPDATE building_cash_openings o SET bank_account_id=a.id FROM bank_accounts a
 WHERE o.bank_account_id IS NULL AND a.property_id=o.property_id AND a.building_id IS NULL
 AND a.created_at<=o.created_at AND (a.deleted_at IS NULL OR a.deleted_at>o.created_at)
 AND NOT EXISTS(SELECT 1 FROM building_cash_openings assigned
   WHERE assigned.property_id=o.property_id AND assigned.bank_account_id=a.id AND assigned.building_id=o.building_id)
 AND (SELECT count(*) FROM bank_accounts b WHERE b.property_id=o.property_id AND b.building_id IS NULL
   AND b.created_at<=o.created_at AND (b.deleted_at IS NULL OR b.deleted_at>o.created_at))=1;
UPDATE building_cash_opening_changes c SET bank_account_id=o.bank_account_id
 FROM building_cash_openings o WHERE c.opening_id=o.id AND c.bank_account_id IS NULL;
-- 갱신으로 예약된 지연 제약 검증을 마쳐 트리거 재활성화 시 pending event 오류를 방지합니다.
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE building_cash_openings ENABLE TRIGGER building_cash_openings_change_check;
ALTER TABLE building_cash_opening_changes ENABLE TRIGGER cash_opening_changes_immutable;
