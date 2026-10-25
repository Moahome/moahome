package com.moahome.server.property.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonInclude;

public record PropertyRegistrationResponse(UUID requestId, PropertySummary property, MembershipSummary membership,
    RegistrationSummary summary, Instant createdAt,
    @JsonInclude(JsonInclude.Include.NON_NULL) CreatorSummary administrator,
    @JsonInclude(JsonInclude.Include.NON_NULL) ManagementStart managementStart) {
	public PropertyRegistrationResponse(UUID requestId, PropertySummary property, MembershipSummary membership,
	    RegistrationSummary summary, Instant createdAt, CreatorSummary administrator) {
		this(requestId, property, membership, summary, createdAt, administrator, null);
	}

	public PropertyRegistrationResponse(UUID requestId, PropertySummary property, MembershipSummary membership,
	    RegistrationSummary summary, Instant createdAt) {
		this(requestId, property, membership, summary, createdAt, null, null);
	}

	public record ManagementStart(LocalDate cutoffDate, String firstBillingMonth,
	    LocalDate cashCutoffDate) {
	}

	/** 최초 자동 연결의 명부·세대 관계 ID만 보존하고 이름·연락처 원문은 성공 스냅샷에 넣지 않습니다. */
	public record CreatorSummary(String residenceType, UUID residentId, UUID unitId, UUID unitResidentId) {
	}

	public record PropertySummary(UUID id, String name, boolean hasBuildings, String status) {
	}

	public record MembershipSummary(UUID id, String role, String status) {
	}

	public record RegistrationSummary(int buildingCount, int unitCount, int bankAccountCount, int feeItemCount,
	    long monthlyDefaultAmount) {
	}
}
