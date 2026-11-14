package com.moahome.server.notice.repo;

import com.moahome.server.common.persistence.AdvisoryLocks;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import com.moahome.server.notice.dto.NoticeResponse;
import com.moahome.server.notice.dto.NoticeSaveRequest;

@Repository
public class NoticeRepository {

	public record Stored(NoticeResponse.Detail detail, OffsetDateTime deletedAt, String creationFingerprint,
		UUID requestId, String fingerprint, UUID createdBy) {
	}

	private final JdbcTemplate jdbc;

	private static final RowMapper<Stored> ROW = (rs, index) -> new Stored(new NoticeResponse.Detail(
		rs.getObject("property_id", UUID.class), rs.getObject("id", UUID.class), rs.getLong("number"),
		rs.getString("title"), rs.getString("content"), rs.getBoolean("important"),
		rs.getObject("created_at", OffsetDateTime.class), rs.getObject("updated_at", OffsetDateTime.class),
		rs.getLong("views"), rs.getLong("version"), false, false, rs.getString("author_name")), rs.getObject("deleted_at", OffsetDateTime.class),
		rs.getString("creation_fingerprint"), rs.getObject("last_request_id", UUID.class), rs.getString("last_fingerprint"),
		rs.getObject("created_by", UUID.class));

	public NoticeRepository(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/** 생성·수정·삭제를 같은 대상 안에서 직렬화하며 트랜잭션 롤백 시 번호와 본문도 함께 되돌립니다. */
	public void lock(UUID propertyId) {
		AdvisoryLocks.acquire(jdbc, "moahome:notices:" + propertyId);
	}

	public Optional<Stored> find(UUID propertyId, UUID id) {
		return jdbc.query("select n.*, u.display_name as author_name from notices n join users u on u.id = n.created_by "
			+ "where n.property_id = ? and n.id = ?", ROW, propertyId, id).stream().findFirst();
	}

	public long count(UUID propertyId, String pattern, boolean content) {
		String column = content ? "content" : "title";
		return jdbc.queryForObject("select count(*) from notices where property_id = ? and deleted_at is null "
			+ "and lower(" + column + ") like ? escape '\\'", Long.class, propertyId, pattern);
	}

	public List<NoticeResponse.Summary> list(UUID propertyId, String pattern, boolean content, int offset) {
		String column = content ? "content" : "title";
		return jdbc.query("select id, number, title, important, created_at, views from notices "
			+ "where property_id = ? and deleted_at is null and lower(" + column + ") like ? escape '\\' "
			+ "order by important desc, number desc limit 10 offset ?", (rs, index) -> new NoticeResponse.Summary(
				rs.getObject("id", UUID.class), rs.getLong("number"), rs.getString("title"), rs.getBoolean("important"),
				rs.getObject("created_at", OffsetDateTime.class), rs.getLong("views")), propertyId, pattern, offset);
	}

	/** 삭제된 글까지 포함한 마지막 번호 다음 값을 사용하므로 표시 번호를 당겨 채우지 않습니다. */
	public void create(UUID propertyId, UUID id, UUID actor, NoticeSaveRequest request, String fingerprint,
		OffsetDateTime at) {
		jdbc.update("insert into notices (id, property_id, number, title, content, important, created_by, updated_by, "
			+ "created_at, updated_at, creation_fingerprint, last_request_id, last_fingerprint) "
			+ "select ?, ?, coalesce(max(number), 0) + 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? from notices where property_id = ?",
			id, propertyId, request.title().strip(), request.content(), request.important(), actor, actor, at, at,
			fingerprint, request.requestId(), fingerprint, propertyId);
	}

	public void update(UUID propertyId, UUID id, UUID actor, NoticeSaveRequest request, String fingerprint,
		OffsetDateTime at) {
		jdbc.update("update notices set title = ?, content = ?, important = ?, updated_by = ?, updated_at = ?, "
			+ "version = version + 1, last_request_id = ?, last_fingerprint = ? where property_id = ? and id = ?",
			request.title().strip(), request.content(), request.important(), actor, at, request.requestId(), fingerprint,
			propertyId, id);
	}

	public void incrementViews(UUID propertyId, UUID id) {
		jdbc.update("update notices set views = views + 1 where property_id = ? and id = ? and deleted_at is null", propertyId, id);
	}

	public void delete(UUID propertyId, UUID id, UUID actor, OffsetDateTime at) {
		jdbc.update("update notices set deleted_at = ?, updated_at = ?, updated_by = ?, version = version + 1 "
			+ "where property_id = ? and id = ? and deleted_at is null", at, at, actor, propertyId, id);
	}
}
