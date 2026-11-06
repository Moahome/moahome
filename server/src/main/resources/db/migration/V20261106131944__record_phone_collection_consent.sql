-- 기존 운영 번호는 사전 동의 완료라는 사용자 확인에 따라 이관합니다.
-- 기록 시각은 이관 시각이며 과거 실제 동의일이나 새로운 고지 동의일로 꾸미지 않습니다.

ALTER TABLE residents
    ADD COLUMN phone_consent boolean NOT NULL DEFAULT false,
    ADD COLUMN phone_consent_source varchar(30),
    ADD COLUMN phone_consent_recorded_at timestamptz,
    ADD COLUMN phone_consent_recorded_by uuid REFERENCES users(id),
    ADD COLUMN phone_consent_notice_version varchar(30);

UPDATE residents
SET phone_consent = true,
    phone_consent_source = 'LEGACY_IMPORT',
    phone_consent_recorded_at = CURRENT_TIMESTAMP
WHERE phone_encrypted IS NOT NULL;

-- 신규 입력의 기본값은 false이며 기존 자료 보정이 향후 동의 생략으로 이어지지 않습니다.
ALTER TABLE residents ADD CONSTRAINT residents_phone_consent_check CHECK (
    (phone_consent = false AND phone_consent_source IS NULL AND phone_consent_recorded_at IS NULL
        AND phone_consent_recorded_by IS NULL AND phone_consent_notice_version IS NULL)
    OR (phone_consent = true AND phone_encrypted IS NOT NULL
        AND phone_consent_source IN ('LEGACY_IMPORT', 'SELF', 'ADMIN', 'EXCEL')
        AND phone_consent_recorded_at IS NOT NULL
        AND (phone_consent_source = 'LEGACY_IMPORT'
            OR (phone_consent_recorded_by IS NOT NULL AND phone_consent_notice_version = 'PHONE_V1')))
);

ALTER TABLE membership_requests
    ADD COLUMN phone_consent boolean NOT NULL DEFAULT false,
    ADD COLUMN phone_consent_source varchar(30),
    ADD COLUMN phone_consent_recorded_at timestamptz,
    ADD COLUMN phone_consent_recorded_by uuid REFERENCES users(id),
    ADD COLUMN phone_consent_notice_version varchar(30);

UPDATE membership_requests
SET phone_consent = true,
    phone_consent_source = 'LEGACY_IMPORT',
    phone_consent_recorded_at = CURRENT_TIMESTAMP
WHERE request_phone_encrypted IS NOT NULL;

-- 신규 입력의 기본값은 false이며 기존 자료 보정이 향후 동의 생략으로 이어지지 않습니다.
ALTER TABLE membership_requests ADD CONSTRAINT membership_requests_phone_consent_check CHECK (
    (phone_consent = false AND phone_consent_source IS NULL AND phone_consent_recorded_at IS NULL
        AND phone_consent_recorded_by IS NULL AND phone_consent_notice_version IS NULL)
    OR (phone_consent = true AND request_phone_encrypted IS NOT NULL
        AND phone_consent_source IN ('LEGACY_IMPORT', 'SELF', 'ADMIN', 'EXCEL')
        AND phone_consent_recorded_at IS NOT NULL
        AND (phone_consent_source = 'LEGACY_IMPORT'
            OR (phone_consent_recorded_by IS NOT NULL AND phone_consent_notice_version = 'PHONE_V1')))
);

ALTER TABLE resident_invitations
    ADD COLUMN phone_consent boolean NOT NULL DEFAULT false,
    ADD COLUMN phone_consent_source varchar(30),
    ADD COLUMN phone_consent_recorded_at timestamptz,
    ADD COLUMN phone_consent_recorded_by uuid REFERENCES users(id),
    ADD COLUMN phone_consent_notice_version varchar(30);

UPDATE resident_invitations
SET phone_consent = true,
    phone_consent_source = 'LEGACY_IMPORT',
    phone_consent_recorded_at = CURRENT_TIMESTAMP
WHERE phone_encrypted IS NOT NULL;

-- 신규 입력의 기본값은 false이며 기존 자료 보정이 향후 동의 생략으로 이어지지 않습니다.
ALTER TABLE resident_invitations ADD CONSTRAINT resident_invitations_phone_consent_check CHECK (
    (phone_consent = false AND phone_consent_source IS NULL AND phone_consent_recorded_at IS NULL
        AND phone_consent_recorded_by IS NULL AND phone_consent_notice_version IS NULL)
    OR (phone_consent = true AND phone_encrypted IS NOT NULL
        AND phone_consent_source IN ('LEGACY_IMPORT', 'SELF', 'ADMIN', 'EXCEL')
        AND phone_consent_recorded_at IS NOT NULL
        AND (phone_consent_source = 'LEGACY_IMPORT'
            OR (phone_consent_recorded_by IS NOT NULL AND phone_consent_notice_version = 'PHONE_V1')))
);
