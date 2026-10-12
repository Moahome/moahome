-- 재등록 요청은 기존 주민 ID를 재사용하므로 요청 ID와 저장 결과를 따로 연결합니다.
-- 기존 주민·세대 관계·가입 권한은 변경하지 않고 과거 삭제/퇴거 이력도 유지합니다.
ALTER TABLE unit_residents ADD CONSTRAINT unit_residents_result_scope_unique UNIQUE (property_id, resident_id, id);
CREATE TABLE resident_registration_results (
    request_id uuid PRIMARY KEY,
    property_id uuid NOT NULL REFERENCES properties(id),
    resident_id uuid NOT NULL,
    unit_resident_id uuid NOT NULL,
    created_by uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL,
    FOREIGN KEY (property_id, resident_id) REFERENCES residents(property_id, id),
    FOREIGN KEY (property_id, resident_id, unit_resident_id) REFERENCES unit_residents(property_id, resident_id, id)
);
