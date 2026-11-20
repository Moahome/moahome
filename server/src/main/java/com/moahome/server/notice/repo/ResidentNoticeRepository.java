package com.moahome.server.notice.repo;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import com.moahome.server.notice.dto.ResidentNoticeResponse;

@Repository
public class ResidentNoticeRepository {

	public record Grant(UUID id, UUID propertyId, String nonce, String hash, OffsetDateTime createdAt,
	    OffsetDateTime revokedAt) {
	}

	private static final RowMapper<Grant> GRANT = (rs, index) -> new Grant(rs.getObject("id", UUID.class),
	    rs.getObject("property_id", UUID.class), rs.getString("nonce"), rs.getString("token_hash"),
	    rs.getObject("created_at", OffsetDateTime.class), rs.getObject("revoked_at", OffsetDateTime.class));

	private final JdbcTemplate jdbc;

	public ResidentNoticeRepository(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public Optional<Grant> findGrant(UUID id) {
		return jdbc.query("select * from notice_access_links where id = ?", GRANT, id).stream().findFirst();
	}

	public Optional<Grant> activeGrant(UUID propertyId) {
		return jdbc.query("select * from notice_access_links where property_id = ? and revoked_at is null",
		    GRANT, propertyId).stream().findFirst();
	}

	public void createGrant(Grant grant, UUID actor) {
		jdbc.update("insert into notice_access_links (id, property_id, created_by, nonce, token_hash, created_at) "
		    + "values (?, ?, ?, ?, ?, ?)", grant.id(), grant.propertyId(), actor, grant.nonce(), grant.hash(),
		    grant.createdAt());
	}

	public void revoke(UUID propertyId, UUID id, OffsetDateTime at) {
		jdbc.update("update notice_access_links set revoked_at = ? where property_id = ? and id = ? "
		    + "and revoked_at is null", at, propertyId, id);
	}

	/** 관리대상이 삭제되면 살아 있는 링크와 세션도 건물 정보를 반환하지 않습니다. */
	public Optional<ResidentNoticeResponse.Context> context(UUID propertyId) {
		return jdbc.query("select id, name from properties where id = ? and deleted_at is null",
		    (rs, index) -> new ResidentNoticeResponse.Context(rs.getObject("id", UUID.class), rs.getString("name")),
		    propertyId).stream().findFirst();
	}

	/** 상단 중요 공지는 일반 목록의 건수와 페이지를 차지하지 않습니다. */
	public long count(UUID propertyId, String pattern) {
		return jdbc.queryForObject("select count(*) from notices where property_id = ? "
		    + "and deleted_at is null and important = false and lower(title) like ? escape '\\'", Long.class,
		    propertyId, pattern);
	}

	/** 중요 공지를 제외한 일반 공지만 페이지당 10개씩 최신순으로 조회합니다. */
	public List<ResidentNoticeResponse.Summary> list(UUID propertyId, String pattern, int offset) {
		return jdbc.query("select id, title, important, created_at from notices where property_id = ? "
		    + "and deleted_at is null and important = false and lower(title) like ? escape '\\' "
		    + "order by number desc limit 10 offset ?",
		    (rs, index) -> new ResidentNoticeResponse.Summary(rs.getObject("id", UUID.class), rs.getString("title"),
		        rs.getBoolean("important"), rs.getObject("created_at", OffsetDateTime.class)),
		    propertyId, pattern, offset);
	}

	/** 검색에 맞는 중요 공지는 페이지와 관계없이 상단 전용 영역에서만 표시합니다. */
	public List<ResidentNoticeResponse.Summary> listImportant(UUID propertyId, String pattern) {
		return jdbc.query("select id, title, important, created_at from notices where property_id = ? "
		    + "and deleted_at is null and important = true and lower(title) like ? escape '\\' order by number desc",
		    (rs, index) -> new ResidentNoticeResponse.Summary(rs.getObject("id", UUID.class), rs.getString("title"),
		        rs.getBoolean("important"), rs.getObject("created_at", OffsetDateTime.class)), propertyId, pattern);
	}
}
