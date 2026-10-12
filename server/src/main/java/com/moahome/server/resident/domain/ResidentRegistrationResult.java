package com.moahome.server.resident.domain;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;

/** 새 요청 ID와 재사용한 주민·새 현재 관계를 연결해 재등록 응답 유실에도 중복 복구하지 않습니다. */
@Getter
@Entity
@Table(name = "resident_registration_results")
public class ResidentRegistrationResult implements org.springframework.data.domain.Persistable<UUID> {
	@Id @Column(name = "request_id") private UUID id;
	@Column(name = "property_id", nullable = false, updatable = false) private UUID propertyId;
	@Column(name = "resident_id", nullable = false, updatable = false) private UUID residentId;
	@Column(name = "unit_resident_id", nullable = false, updatable = false) private UUID unitResidentId;
	@Column(name = "created_by", nullable = false, updatable = false) private UUID createdBy;
	@Column(name = "created_at", nullable = false, updatable = false) private OffsetDateTime createdAt;
	@Transient private boolean newRecord;
	protected ResidentRegistrationResult() { }
	@Override public boolean isNew() { return newRecord; }
	@PostLoad @PostPersist private void markPersisted() { newRecord = false; }

	/** 원래 요청과 실제 저장 결과를 함께 고정하며 다른 주민·대상의 관계를 결과로 저장하지 않습니다. */
	public static ResidentRegistrationResult record(UUID requestId, Resident resident, UnitResident relation, UUID actor, OffsetDateTime at) {
		if (!resident.getPropertyId().equals(relation.getPropertyId()) || !resident.getId().equals(relation.getResidentId())) {
			throw new IllegalArgumentException("Invalid registration result");
		}
		var result = new ResidentRegistrationResult();
		result.newRecord = true;
		result.id = Objects.requireNonNull(requestId);
		result.propertyId = resident.getPropertyId();
		result.residentId = resident.getId();
		result.unitResidentId = relation.getId();
		result.createdBy = Objects.requireNonNull(actor);
		result.createdAt = Objects.requireNonNull(at);
		return result;
	}
}
