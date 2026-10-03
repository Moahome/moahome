-- users stores login accounts. Resident contacts belong to residents / membership_requests.
-- This removes legacy account phone data; it does not create or populate resident records.
ALTER TABLE users
    DROP CONSTRAINT users_phone_check,
    DROP COLUMN phone_encrypted,
    DROP COLUMN phone_hmac,
    DROP COLUMN phone_last4,
    DROP COLUMN phone_verified_at;
