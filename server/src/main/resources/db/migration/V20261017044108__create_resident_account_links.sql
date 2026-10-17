-- 기존 관리소장의 명시적 본인 연결을 기록합니다. 가입 신청이나 과거 등록 성공 스냅샷을 변경하지 않습니다.
CREATE TABLE resident_account_links (
    id uuid PRIMARY KEY,
    property_id uuid NOT NULL REFERENCES properties(id),
    resident_id uuid NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id),
    unit_resident_id uuid NOT NULL,
    linked_by uuid NOT NULL REFERENCES users(id),
    linked_at timestamptz NOT NULL,
    FOREIGN KEY (property_id, resident_id) REFERENCES residents(property_id, id),
    -- 관계 ID는 삭제·재입주 후에도 과거 연결 이력을 보존해야 하므로 FK로 삭제를 막지 않습니다.
    -- 서비스에서 같은 대상·주민의 현재 관계인지 검증하고 조회에서도 관계 ID의 일치를 다시 확인합니다.
    CHECK (linked_by = user_id),
    UNIQUE (property_id, resident_id, user_id, unit_resident_id)
);
