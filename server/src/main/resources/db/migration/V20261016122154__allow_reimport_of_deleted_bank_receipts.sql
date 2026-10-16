-- 미확정 입금을 삭제하면 같은 엑셀 행을 다시 가져올 수 있도록 활성 원본에만 중복 제약을 적용합니다.
-- 과거 수납·취소의 FK와 원본 내용은 보존하고 삭제 표시·처리자를 별도로 기록합니다.
ALTER TABLE bank_transactions
 ADD COLUMN deleted_at timestamptz,
 ADD COLUMN deleted_by uuid REFERENCES users(id),
 ADD CONSTRAINT bank_transactions_deletion_actor_check CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));
ALTER TABLE bank_transactions DROP CONSTRAINT bank_transactions_bank_account_id_deduplication_key_key;
CREATE UNIQUE INDEX bank_transactions_active_deduplication_idx
 ON bank_transactions(bank_account_id,deduplication_key) WHERE deleted_at IS NULL;

-- 이전 삭제 구현으로 수납만 숨겨지고 원본 중복 키가 남은 자료도 보정합니다.
-- 활성 초안·확정 수납이 하나라도 남은 원본은 보존해 정상 입금의 중복 저장을 막습니다.
WITH deleted_receipts AS (
 SELECT DISTINCT ON (bank_transaction_id) bank_transaction_id,deleted_at,deleted_by
 FROM payments WHERE bank_transaction_id IS NOT NULL AND deleted_at IS NOT NULL
 ORDER BY bank_transaction_id,deleted_at DESC,id
)
UPDATE bank_transactions original
SET deleted_at=receipt.deleted_at,deleted_by=receipt.deleted_by
FROM deleted_receipts receipt
WHERE original.id=receipt.bank_transaction_id AND original.deleted_at IS NULL
 AND NOT EXISTS (
  SELECT 1 FROM payments active
  WHERE active.bank_transaction_id=original.id AND active.deleted_at IS NULL
   AND active.status IN ('PENDING','ON_HOLD','CONFIRMED')
 );
