-- 기존·신규 주민 모두 기본 ON으로 두며 발송 가능 연락처·전체 발송 여부는 별도로 검증합니다.
ALTER TABLE residents ADD COLUMN alimtalk_enabled boolean NOT NULL DEFAULT true;
