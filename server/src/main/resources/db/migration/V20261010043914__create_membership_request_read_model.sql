-- 주민 목록의 가입 승인 기록과 확인된 대기 신청을 조회하기 위한 저장 구조입니다.
-- 신청·승인·자동 매칭 API는 추가하지 않으며 초대 연결은 초대 기능 구현 시 확장합니다.
CREATE TABLE membership_requests (
    id uuid PRIMARY KEY,
    property_id uuid NOT NULL REFERENCES properties(id),
    unit_id uuid NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id),
    matched_resident_id uuid,
    request_phone_encrypted text NOT NULL,
    request_phone_hmac char(64) NOT NULL CHECK (request_phone_hmac ~ '^[0-9a-f]{64}$'),
    request_phone_last4 char(4) NOT NULL CHECK (request_phone_last4 ~ '^[0-9]{4}$'),
    match_status varchar(20) NOT NULL CHECK (match_status IN ('MATCHED', 'POSSIBLE', 'NOT_MATCHED', 'MANUAL')),
    status varchar(20) NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED')),
    requested_at timestamptz NOT NULL,
    reviewed_by uuid REFERENCES users(id),
    reviewed_at timestamptz,
    rejection_reason varchar(255),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    deleted_at timestamptz,
    deleted_by uuid REFERENCES users(id),
    -- 신청의 세대와 확인된 주민은 반드시 신청과 같은 관리대상이어야 합니다.
    FOREIGN KEY (property_id, unit_id) REFERENCES units(property_id, id),
    FOREIGN KEY (property_id, matched_resident_id) REFERENCES residents(property_id, id)
);
-- 같은 계정의 같은 세대 중복 대기만 막고 다른 주민의 같은 세대 신청은 허용합니다.
CREATE UNIQUE INDEX membership_requests_pending_user_unit_idx
    ON membership_requests(property_id, unit_id, user_id)
    WHERE status = 'PENDING' AND deleted_at IS NULL;
CREATE INDEX membership_requests_resident_pending_idx
    ON membership_requests(property_id, matched_resident_id, unit_id)
    WHERE status = 'PENDING' AND deleted_at IS NULL;
CREATE INDEX membership_requests_user_approved_idx
    ON membership_requests(property_id, user_id, unit_id)
    WHERE status = 'APPROVED' AND deleted_at IS NULL;
