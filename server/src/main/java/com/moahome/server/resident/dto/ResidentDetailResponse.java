package com.moahome.server.resident.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import com.moahome.server.resident.domain.ResidentSignupStatus;

/** 기본 상세도 마스킹만 반환하며 전체 연락처는 명시적 공개 요청으로 분리합니다. */
public record ResidentDetailResponse(UUID id, UUID propertyId, String name, String phoneLast4, UUID unitId,
    UUID buildingId, String buildingName, String unitNumber, String relationType, boolean representative,
    ResidentSignupStatus signupStatus, OffsetDateTime createdAt, OffsetDateTime updatedAt, boolean hasLinkedRequests,
    List<Candidate> representativeCandidates, String serviceRole) {
	public ResidentDetailResponse(UUID id, UUID propertyId, String name, String phoneLast4, UUID unitId,
	    UUID buildingId, String buildingName, String unitNumber, String relationType, boolean representative,
	    ResidentSignupStatus signupStatus, OffsetDateTime createdAt, OffsetDateTime updatedAt,
	    boolean hasLinkedRequests, List<Candidate> representativeCandidates) {
		this(id, propertyId, name, phoneLast4, unitId, buildingId, buildingName, unitNumber, relationType,
		    representative, signupStatus, createdAt, updatedAt, hasLinkedRequests, representativeCandidates, null);
	}

	public record Candidate(UUID id, String name) {
	}
}
