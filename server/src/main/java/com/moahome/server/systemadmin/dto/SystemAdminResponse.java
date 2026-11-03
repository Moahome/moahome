package com.moahome.server.systemadmin.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import com.moahome.server.user.domain.SystemRole;
import com.moahome.server.user.domain.UserStatus;

public final class SystemAdminResponse {
	private SystemAdminResponse() {
	}

	public record Member(UUID id, String displayName, UserStatus status, SystemRole systemRole,
	    boolean canCreateProperty, OffsetDateTime createdAt) {
	}

	public record Members(List<Member> users, int page, int pageSize, long total, int pageCount) {
	}
}
