package com.moahome.server.notice.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class NoticeResponse {

	private NoticeResponse() {
	}

	public record Summary(UUID id, long number, String title, boolean important, OffsetDateTime createdAt, long views) {
	}

	public record Listing(UUID propertyId, List<Summary> items, long total, int page, int pageCount) {
	}

	public record Detail(UUID propertyId, UUID id, long number, String title, String content, boolean important,
		OffsetDateTime createdAt, OffsetDateTime updatedAt, long views, long version, boolean canEdit, boolean canDelete, String authorName) {
	}
}
