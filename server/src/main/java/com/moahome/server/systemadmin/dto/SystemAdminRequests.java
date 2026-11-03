package com.moahome.server.systemadmin.dto;

import java.util.UUID;
import jakarta.validation.constraints.NotNull;

public final class SystemAdminRequests {
	private SystemAdminRequests() {
	}

	public record Permission(@NotNull UUID requestId, @NotNull Boolean allowed, @NotNull Boolean expectedAllowed) {
	}

	public record Promotion(@NotNull UUID requestId) {
	}
}
