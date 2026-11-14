package com.moahome.server.notice.repo;

import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class NoticeAssetRepository {
	public record Asset(UUID id, UUID propertyId, UUID uploadedBy, UUID noticeId, String objectKey,
		String name, String contentType, long size, String hash, boolean image) {
	}
	private final JdbcTemplate jdbc;

	public NoticeAssetRepository(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/** 같은 업로드 ID의 동시 재전송을 직렬화하여 S3 키·메타데이터가 서로 달라지지 않게 합니다. */
	public void lock(UUID id) {
		jdbc.queryForList("select pg_advisory_xact_lock(hashtextextended(?, 0))", "moahome:notice-asset:" + id);
	}

	public Optional<Asset> find(UUID id) {
		return jdbc.query("select * from notice_assets where id = ?", (rs, index) -> new Asset(
			rs.getObject("id", UUID.class), rs.getObject("property_id", UUID.class),
			rs.getObject("uploaded_by", UUID.class), rs.getObject("notice_id", UUID.class),
			rs.getString("object_key"), rs.getString("file_name"), rs.getString("content_type"),
			rs.getLong("byte_size"), rs.getString("sha256"), rs.getBoolean("image")), id).stream().findFirst();
	}

	public void create(Asset asset) {
		jdbc.update("insert into notice_assets (id, property_id, uploaded_by, object_key, file_name, "
			+ "content_type, byte_size, sha256, image) values (?, ?, ?, ?, ?, ?, ?, ?, ?)", asset.id(),
			asset.propertyId(), asset.uploadedBy(), asset.objectKey(), asset.name(), asset.contentType(),
			asset.size(), asset.hash(), asset.image());
	}

	public void bind(UUID assetId, UUID noticeId) {
		jdbc.update("update notice_assets set notice_id = ? where id = ? and notice_id is null", noticeId, assetId);
	}
}
