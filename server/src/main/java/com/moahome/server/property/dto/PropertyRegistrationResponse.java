package com.moahome.server.property.dto;

import java.time.Instant;
import java.util.UUID;

public record PropertyRegistrationResponse(
	UUID requestId, PropertySummary property, MembershipSummary membership, RegistrationSummary summary, Instant createdAt
) {
	public record PropertySummary(UUID id, String name, boolean hasBuildings, String status) {
	}
	public record MembershipSummary(UUID id, String role, String status) {
	}
	public record RegistrationSummary(int buildingCount, int unitCount, int bankAccountCount, int feeItemCount,
		long monthlyDefaultAmount) {
	}
}
