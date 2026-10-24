-- 기존 해시 전용 초대와 유효기간은 보존하고 새로 발급하는 개인 코드에만 재전달용 암호문을 보관합니다.
ALTER TABLE resident_invitations ADD COLUMN token_encrypted text;
ALTER TABLE resident_invitations ADD CONSTRAINT resident_invitations_protected_code_state
 CHECK (token_encrypted IS NULL OR status='ISSUED');
