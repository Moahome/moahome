-- 입금 삭제는 원본·감사 이력을 보존하면서 목록과 누적 수납에서 제외합니다.
-- 기존 자료는 삭제 표시 없이 유지하며 수납 확정 상태의 금액이 숨겨진 채 합계에 남는 일을 막습니다.
ALTER TABLE payments
 ADD COLUMN deleted_at timestamptz,
 ADD COLUMN deleted_by uuid REFERENCES users(id),
 ADD CONSTRAINT payments_deletion_actor_check CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
 ADD CONSTRAINT payments_deleted_status_check CHECK (deleted_at IS NULL OR status <> 'CONFIRMED');
