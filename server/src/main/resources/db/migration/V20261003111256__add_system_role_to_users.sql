-- Backfill all existing accounts, including suspended / withdrawn accounts, as ordinary users.
-- Platform administrator assignment is handled separately from social signup.
ALTER TABLE users
    ADD COLUMN system_role varchar(20) NOT NULL DEFAULT 'USER',
    ADD CONSTRAINT users_system_role_check CHECK (system_role IN ('USER', 'ADMIN'));
