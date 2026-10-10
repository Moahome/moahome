-- 검증한 명부와 행별 재시도 ID를 PostgreSQL에 임시 보관합니다. 연락처 원문은 포함하지 않습니다.
CREATE TABLE resident_import_batches (
    id uuid PRIMARY KEY,
    property_id uuid NOT NULL REFERENCES properties(id),
    created_by uuid NOT NULL REFERENCES users(id),
    rows_payload text NOT NULL,
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    CONSTRAINT resident_import_batch_expiry CHECK (expires_at > created_at)
);
CREATE INDEX resident_import_batches_expiry_idx ON resident_import_batches(expires_at);
