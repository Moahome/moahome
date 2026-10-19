package com.moahome.server.membership.dto;

import java.time.OffsetDateTime;
import java.util.*;
import jakarta.validation.constraints.*;

public final class SignupRequests {
	private SignupRequests() {
	}

	public record Create(@NotNull UUID unitId, @NotBlank @Size(max = 64) String phone) {
		@Override
		public String toString() {
			return "Create[REDACTED]";
		}
	}

	public record Approve(@NotNull UUID residentId, @NotNull OffsetDateTime expectedUpdatedAt) {
	}

	public record Reject(@NotNull OffsetDateTime expectedUpdatedAt) {
	}

	public record Candidate(UUID residentId, String name) {
	}

	public record Item(UUID id, UUID unitId, String unitLabel, String requesterName, String phoneLast4, String status,
	    OffsetDateTime requestedAt, OffsetDateTime updatedAt, List<Candidate> candidates) {
	}

	public record Workspace(UUID propertyId, List<Item> requests) {
	}

	public record UnitOption(UUID unitId, String label) {
	}

	public record Options(UUID propertyId, String propertyName, List<UnitOption> units) {
	}

	public record Result(UUID id, String status) {
	}
}
