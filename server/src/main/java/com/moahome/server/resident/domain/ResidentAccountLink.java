package com.moahome.server.resident.domain;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;
import jakarta.persistence.*;

/** 기존 관리소장이 확인한 본인 연결의 출처를 보존하며 이전 세대 관계에 대한 승인을 새 관계로 복구하지 않습니다. */
@Entity
@Table(name = "resident_account_links")
public class ResidentAccountLink {
	@Id
	private UUID id;

	@Column(name = "property_id", nullable = false, updatable = false)
	private UUID propertyId;

	@Column(name = "resident_id", nullable = false, updatable = false)
	private UUID residentId;

	@Column(name = "user_id", nullable = false, updatable = false)
	private UUID userId;

	@Column(name = "unit_resident_id", nullable = false, updatable = false)
	private UUID unitResidentId;

	@Column(name = "linked_by", nullable = false, updatable = false)
	private UUID linkedBy;

	@Column(name = "linked_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
	private OffsetDateTime linkedAt;

	protected ResidentAccountLink() {
	}

	/** 이미 본인 계정으로 연결된 주민과 해당 주민의 같은 대상 현재 관계만 기록합니다. */
	public static ResidentAccountLink record(Resident resident, UnitResident affiliation, UUID actor,
	    OffsetDateTime at) {
		if (!actor.equals(resident.getUserId()) || !resident.getId().equals(affiliation.getResidentId())
		    || !resident.getPropertyId().equals(affiliation.getPropertyId())
		    || !"ACTIVE".equals(affiliation.getStatus()) || affiliation.getDeletedAt() != null
		    || resident.getDeletedAt() != null) {
			throw new IllegalArgumentException("Invalid resident account link");
		}
		var link = new ResidentAccountLink();
		link.id = UUID.randomUUID();
		link.propertyId = resident.getPropertyId();
		link.residentId = resident.getId();
		link.userId = actor;
		link.unitResidentId = affiliation.getId();
		link.linkedBy = actor;
		link.linkedAt = Objects.requireNonNull(at);
		return link;
	}
}
