-- 외부 부담당자 초대와 과거 주민 초대 이력은 유지하고, 신규 개인 주민 초대를 별도로 저장합니다.
CREATE TABLE resident_invitations (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 resident_id uuid NOT NULL,
 unit_id uuid NOT NULL,
 unit_resident_id uuid NOT NULL REFERENCES unit_residents(id),
 resident_updated_at timestamptz NOT NULL,
 token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 status varchar(24) NOT NULL CHECK (status IN ('ISSUED','CHANGE_REQUESTED','APPROVED','REVOKED','REJECTED')),
 revision bigint NOT NULL DEFAULT 0,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 requested_by uuid REFERENCES users(id),
 requested_at timestamptz,
 requested_name varchar(50),
 phone_action varchar(10) CHECK (phone_action IN ('KEEP','SET','REMOVE')),
 phone_encrypted text,
 phone_hmac char(64),
 phone_last4 char(4),
 reviewed_by uuid REFERENCES users(id),
 reviewed_at timestamptz,
 FOREIGN KEY (property_id,resident_id) REFERENCES residents(property_id,id),
 FOREIGN KEY (property_id,unit_id) REFERENCES units(property_id,id),
 CHECK (expires_at > created_at),
 CHECK ((phone_encrypted IS NULL AND phone_hmac IS NULL AND phone_last4 IS NULL)
     OR (phone_encrypted IS NOT NULL AND phone_hmac IS NOT NULL AND phone_last4 IS NOT NULL AND phone_hmac ~ '^[0-9a-f]{64}$' AND phone_last4 ~ '^[0-9]{4}$')),
 CHECK (status NOT IN ('CHANGE_REQUESTED','APPROVED') OR (requested_by IS NOT NULL AND requested_at IS NOT NULL)),
 CHECK (status <> 'CHANGE_REQUESTED' OR (requested_name IS NOT NULL AND phone_action IS NOT NULL))
);
-- 같은 주민의 발급·재발급·수락은 Property 잠금 아래 처리하며 진행 중 초대의 중복도 DB에서 차단합니다.
CREATE UNIQUE INDEX resident_invitations_live_resident_idx ON resident_invitations(property_id,resident_id)
 WHERE status IN ('ISSUED','CHANGE_REQUESTED');
CREATE INDEX resident_invitations_property_idx ON resident_invitations(property_id,created_at DESC);

-- 공통 초대와 개인 초대는 별도 저장하며 전체 공유 코드의 원문도 보관하지 않습니다.
CREATE TABLE resident_join_codes (
 id uuid PRIMARY KEY,
 property_id uuid NOT NULL REFERENCES properties(id),
 code_hash char(64) NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
 status varchar(20) NOT NULL CHECK (status IN ('ISSUED','REVOKED')),
 revision bigint NOT NULL DEFAULT 0,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 CHECK (expires_at>created_at),
 UNIQUE(property_id,id)
);
CREATE UNIQUE INDEX resident_join_codes_live_property_idx ON resident_join_codes(property_id) WHERE status='ISSUED';
-- 과거 이름 없는 신청과 필수 전화번호 데이터는 그대로 보존하고 신규 신청에만 이름·코드 출처를 요구합니다.
ALTER TABLE membership_requests ADD COLUMN applicant_name varchar(50);
ALTER TABLE membership_requests ADD COLUMN join_code_id uuid;
ALTER TABLE membership_requests ADD CONSTRAINT membership_requests_code_fk FOREIGN KEY(property_id,join_code_id) REFERENCES resident_join_codes(property_id,id);
ALTER TABLE membership_requests ALTER COLUMN request_phone_encrypted DROP NOT NULL;
ALTER TABLE membership_requests ALTER COLUMN request_phone_hmac DROP NOT NULL;
ALTER TABLE membership_requests ALTER COLUMN request_phone_last4 DROP NOT NULL;
ALTER TABLE membership_requests ADD CONSTRAINT membership_requests_phone_bundle CHECK (
 (request_phone_encrypted IS NULL AND request_phone_hmac IS NULL AND request_phone_last4 IS NULL)
 OR (request_phone_encrypted IS NOT NULL AND request_phone_hmac IS NOT NULL AND request_phone_last4 IS NOT NULL));
ALTER TABLE membership_requests ADD CONSTRAINT membership_requests_named_code CHECK (join_code_id IS NULL OR (applicant_name IS NOT NULL AND length(trim(applicant_name))>0));
