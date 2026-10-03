CREATE TABLE users (
    id uuid PRIMARY KEY,
    display_name varchar(50) NOT NULL,
    profile_image_url varchar(500),
    phone_encrypted text,
    phone_hmac char(64),
    phone_last4 char(4),
    phone_verified_at timestamptz,
    status varchar(20) NOT NULL,
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamptz,
    deleted_by uuid REFERENCES users(id),
    CONSTRAINT users_display_name_check CHECK (length(btrim(display_name)) > 0),
    CONSTRAINT users_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED', 'WITHDRAWN')),
    CONSTRAINT users_phone_check CHECK (
        num_nonnulls(phone_encrypted, phone_hmac, phone_last4, phone_verified_at) = 0
        OR (
            num_nonnulls(phone_encrypted, phone_hmac, phone_last4, phone_verified_at) = 4
            AND length(btrim(phone_encrypted)) > 0
            AND phone_hmac ~ '^[0-9a-f]{64}$'
            AND phone_last4 ~ '^[0-9]{4}$'
        )
    ),
    CONSTRAINT users_deleted_actor_check CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
    CONSTRAINT users_withdrawn_check CHECK ((status = 'WITHDRAWN') = (deleted_at IS NOT NULL))
);

CREATE INDEX users_phone_hmac_idx ON users(phone_hmac)
    WHERE deleted_at IS NULL AND phone_hmac IS NOT NULL;

CREATE TABLE social_accounts (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id),
    provider varchar(20) NOT NULL,
    provider_user_id varchar(255) NOT NULL,
    provider_email varchar(255),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamptz,
    deleted_by uuid REFERENCES users(id),
    CONSTRAINT social_accounts_provider_check CHECK (provider IN ('KAKAO')),
    CONSTRAINT social_accounts_provider_user_id_check CHECK (
        length(btrim(provider_user_id)) > 0 AND provider_user_id = btrim(provider_user_id)
    ),
    CONSTRAINT social_accounts_deleted_actor_check CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);

CREATE UNIQUE INDEX social_accounts_active_identity_idx
    ON social_accounts(provider, provider_user_id) WHERE deleted_at IS NULL;

CREATE INDEX social_accounts_active_user_idx
    ON social_accounts(user_id) WHERE deleted_at IS NULL;
