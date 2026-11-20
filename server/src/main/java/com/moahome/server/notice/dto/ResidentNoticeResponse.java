package com.moahome.server.notice.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class ResidentNoticeResponse {

	private ResidentNoticeResponse() {
	}

	public record Context(UUID propertyId, String name) {
	}

	public record Summary(UUID id, String title, boolean important, OffsetDateTime createdAt) {
	}

	public record Listing(UUID propertyId, List<Summary> importantItems, List<Summary> items, long total, int page,
	    int pageCount) {
	}

	public record Detail(UUID propertyId, UUID id, String title, boolean important, OffsetDateTime createdAt,
	    String content, String authorName) {
	}

	public record ExchangeRequest(@NotBlank @Size(max = 100) String token) {
		@Override
		public String toString() {
			return "ExchangeRequest[REDACTED]";
		}
	}

	public record Link(UUID id, String token, OffsetDateTime createdAt) {
		@Override
		public String toString() {
			return "Link[REDACTED]";
		}
	}
}
