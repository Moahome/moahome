package com.moahome.server.resident.dto;

import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.validation.constraints.*;

/** 마스킹된 번호를 다시 저장하지 않도록 유지·교체·제거를 명시적으로 구분합니다. */
public record ResidentUpdateRequest(@NotBlank @Size(max = 100) String name, @NotNull UUID unitId,
    @NotBlank @Pattern(regexp = "OWNER|TENANT|FAMILY|OTHER") String relationType,
    @NotBlank @Pattern(regexp = "KEEP|REPLACE|REMOVE") String phoneAction, @Size(max = 64) String phone,
    UUID replacementResidentId, @NotNull OffsetDateTime expectedUpdatedAt,
    com.moahome.server.membership.domain.PropertyMemberRole serviceRole,
    com.moahome.server.membership.domain.PropertyMemberRole expectedServiceRole) {
	public ResidentUpdateRequest(String name, UUID unitId, String relationType, String phoneAction, String phone,
	    UUID replacementResidentId, OffsetDateTime expectedUpdatedAt) {
		this(name, unitId, relationType, phoneAction, phone, replacementResidentId, expectedUpdatedAt, null, null);
	}

	@Override
	public String toString() {
		return "ResidentUpdateRequest[REDACTED]";
	}
}
