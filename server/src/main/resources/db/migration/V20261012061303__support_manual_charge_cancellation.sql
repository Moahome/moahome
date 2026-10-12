-- 상세에서 선택한 당월 청구 취소를 구분하고 기존 세대 삭제 취소의 감사 정보를 보존합니다.
-- 공실 제외는 취소와 구분하여 사용 중 복귀 시 같은 당월 스냅샷을 재사용하고, 지난 월 제외 상태는 보존합니다.
ALTER TABLE charges DROP CONSTRAINT charges_status_check;
ALTER TABLE charges ADD CONSTRAINT charges_status_check CHECK (status IN ('DRAFT', 'ISSUED', 'EXCLUDED_VACANT', 'CANCELED'));
ALTER TABLE charges DROP CONSTRAINT charges_issued_at_check;
ALTER TABLE charges ADD CONSTRAINT charges_issued_at_check CHECK (
    (status IN ('ISSUED', 'EXCLUDED_VACANT', 'CANCELED')) = (issued_at IS NOT NULL)
);
ALTER TABLE charges DROP CONSTRAINT charges_cancellation_check;
ALTER TABLE charges ADD CONSTRAINT charges_cancellation_check CHECK (
    (status = 'CANCELED' AND canceled_at IS NOT NULL AND canceled_by IS NOT NULL
        AND cancellation_reason IS NOT NULL AND cancellation_reason IN ('UNIT_DELETED', 'MANUAL_CANCELED'))
    OR (status <> 'CANCELED' AND canceled_at IS NULL AND canceled_by IS NULL AND cancellation_reason IS NULL)
);
