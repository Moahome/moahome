-- 모든 공지를 건물 링크로 열람하므로 글별 공개 구분과 전용 인덱스를 제거합니다.
-- 기존 Migration은 이미 개발 DB에 적용됐을 수 있어 수정하지 않습니다.
DROP INDEX IF EXISTS notices_resident_list_idx;
ALTER TABLE notices DROP COLUMN resident_published;
