-- 동·세대 삭제로 당월 청구를 취소해도 발행 원본과 항목 스냅샷을 보존합니다.
-- 기존 행은 ISSUED/DRAFT를 유지하며 취소 이력은 실제 삭제 요청에서만 기록합니다.
ALTER TABLE charges ADD COLUMN canceled_at timestamptz;
ALTER TABLE charges ADD COLUMN canceled_by uuid REFERENCES users(id);
ALTER TABLE charges ADD COLUMN cancellation_reason varchar(30);
ALTER TABLE charges DROP CONSTRAINT charges_status_check;
ALTER TABLE charges DROP CONSTRAINT charges_check;
ALTER TABLE charges ADD CONSTRAINT charges_status_check CHECK (status IN ('DRAFT', 'ISSUED', 'CANCELED'));
ALTER TABLE charges ADD CONSTRAINT charges_issued_at_check CHECK (
    (status IN ('ISSUED', 'CANCELED')) = (issued_at IS NOT NULL)
);
ALTER TABLE charges ADD CONSTRAINT charges_cancellation_check CHECK (
    (status = 'CANCELED' AND canceled_at IS NOT NULL AND canceled_by IS NOT NULL
        AND cancellation_reason IS NOT NULL AND cancellation_reason = 'UNIT_DELETED')
    OR (status <> 'CANCELED' AND canceled_at IS NULL AND canceled_by IS NULL AND cancellation_reason IS NULL)
);
