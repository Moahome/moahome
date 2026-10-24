package com.moahome.server.membership.dto;

import java.time.OffsetDateTime;
import java.util.*;
import jakarta.validation.constraints.*;

public final class SignupRequests {
	private SignupRequests() {
	}

	public record Create(@NotNull UUID unitId, @NotBlank @Size(max = 50) String name, @Size(max = 64) String phone,
	    @NotBlank @Size(max = 32) String code) {
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
	    OffsetDateTime requestedAt, OffsetDateTime updatedAt, List<Candidate> candidates, String applicantName) {
	}

	public record Workspace(UUID propertyId, List<Item> requests) {
	}

	public record UnlinkedResident(UUID residentId, String name, String phoneLast4, String buildingName,
	    String unitNumber, String relationType) {
	}

	public record UnlinkedResidents(UUID propertyId, List<UnlinkedResident> residents) {
	}

	public record UnitOption(UUID unitId, String label) {
	}

	public record Options(UUID propertyId, String propertyName, List<UnitOption> units) {
	}

	public record Result(UUID id, String status) {
	}
}
