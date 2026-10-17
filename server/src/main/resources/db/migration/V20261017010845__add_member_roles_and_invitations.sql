-- 관리소장은 한 명만 유지합니다. 기존 충돌이 있으면 임의로 권한을 정리하지 않고 Migration을 중단합니다.
-- index 생성은 property_members에 잠금을 요구합니다. 적용 전에 기존 중복 관리소장과 활성 역할 충돌을 확인합니다.
CREATE UNIQUE INDEX property_members_single_admin_idx ON property_members(property_id)
 WHERE role='ADMIN' AND status='ACTIVE' AND ended_at IS NULL AND deleted_at IS NULL;
ALTER TABLE property_members ADD CONSTRAINT property_members_property_id_id_unique UNIQUE(property_id,id);
CREATE TABLE member_role_events (
 id uuid PRIMARY KEY, property_id uuid NOT NULL REFERENCES properties(id), member_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), action varchar(20) NOT NULL CHECK(action IN ('GRANTED','CHANGED','ENDED')),
 previous_role varchar(20) CHECK(previous_role IN ('ADMIN','MANAGER','RESIDENT')),
 next_role varchar(20) NOT NULL CHECK(next_role IN ('ADMIN','MANAGER','RESIDENT')), changed_at timestamptz NOT NULL,
 FOREIGN KEY(property_id,member_id) REFERENCES property_members(property_id,id)
);
CREATE TABLE member_invitations (
 id uuid PRIMARY KEY, property_id uuid NOT NULL REFERENCES properties(id), resident_id uuid, unit_id uuid,
 token_hash varchar(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 role varchar(20) NOT NULL CHECK(role IN ('MANAGER','RESIDENT')),
 status varchar(20) NOT NULL CHECK(status IN ('ISSUED','REQUESTED','APPROVED','REVOKED')),
 revision bigint NOT NULL DEFAULT 0, created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 requested_by uuid REFERENCES users(id), requested_at timestamptz,
 reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz,
 FOREIGN KEY(property_id,resident_id) REFERENCES residents(property_id,id),
 FOREIGN KEY(property_id,unit_id) REFERENCES units(property_id,id),
 CHECK((role='RESIDENT' AND resident_id IS NOT NULL AND unit_id IS NOT NULL)
    OR (role='MANAGER' AND resident_id IS NULL AND unit_id IS NULL)),
 CHECK(expires_at=created_at+interval '1 day'),
 CHECK((requested_by IS NULL)=(requested_at IS NULL)),
 CHECK(status NOT IN ('REQUESTED','APPROVED') OR requested_by IS NOT NULL),
 CHECK((status IN ('APPROVED','REVOKED'))=(reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX member_invitations_property_idx ON member_invitations(property_id,created_at DESC);

CREATE UNIQUE INDEX member_invitations_resident_active_idx ON member_invitations(property_id,resident_id)
 WHERE resident_id IS NOT NULL AND status IN ('ISSUED','REQUESTED');
