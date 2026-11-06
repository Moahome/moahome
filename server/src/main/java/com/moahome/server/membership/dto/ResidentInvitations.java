package com.moahome.server.membership.dto;

import java.time.OffsetDateTime;
import java.util.*;
import jakarta.validation.constraints.*;

public final class ResidentInvitations {
	private ResidentInvitations() {
	}
	public record Token(@NotBlank @Size(max = 32) String token) {
		@Override
		public String toString() {
			return "Token[REDACTED]";
		}
	}

	public record Claim(@NotBlank @Size(max = 32) String token, boolean correction, @Size(max = 50) String name,
	    @Pattern(regexp = "KEEP|SET|REMOVE") String phoneAction, @Size(max = 64) String phone, Boolean phoneConsent) {
		public Claim(String token, boolean correction, String name, String phoneAction, String phone) {
			this(token, correction, name, phoneAction, phone, null);
		}
		@Override
		public String toString() {
			return "Claim[REDACTED]";
		}
	}

	public record Review(@NotNull @Min(0) Long revision) {
	}

	public record Issued(UUID id, String token, OffsetDateTime expiresAt) {
		@Override
		public String toString() {
			return "Issued[REDACTED]";
		}
	}

	public record Item(UUID id, UUID residentId, String name, String unitLabel, String phoneLast4, String status,
	    long revision, OffsetDateTime expiresAt, String requestedName, String requestedPhoneLast4, String phoneAction) {
	}

	public record Workspace(UUID propertyId, List<Item> invitations) {
	}

	public record Preview(UUID propertyId, String propertyName, String name, String unitLabel, String phoneLast4, String status,
	    OffsetDateTime expiresAt, long revision, boolean phoneConsent) {
		public Preview(UUID propertyId, String propertyName, String name, String unitLabel, String phoneLast4, String status,
		    OffsetDateTime expiresAt, long revision) {
			this(propertyId, propertyName, name, unitLabel, phoneLast4, status, expiresAt, revision, false);
		}
	}

	public record Result(String status) {
	}
}
