package com.moahome.server.resident.domain;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;
import com.moahome.server.property.domain.Unit;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(name = "unit_residents")
public class UnitResident {
	@Id private UUID id;
	@Column(name = "property_id", nullable = false) private UUID propertyId;
	@Column(name = "unit_id", nullable = false) private UUID unitId;
	@Column(name = "resident_id", nullable = false) private UUID residentId;
	@Column(name = "relation_type", nullable = false, length = 20) private String relationType;
	@Column(name = "is_household_rep", nullable = false) private boolean householdRep;
	@Column(nullable = false, length = 20) private String status;
	@Column(name = "created_at", nullable = false, columnDefinition = "timestamptz") private OffsetDateTime createdAt;
	@Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz") private OffsetDateTime updatedAt;
	@Column(name = "deleted_at", columnDefinition = "timestamptz") private OffsetDateTime deletedAt;

	protected UnitResident() { }

	/** 같은 관리대상의 신규 주민과 기존 세대만 연결하며 대표 여부는 잠금 아래 최초 등록 판정으로 전달받습니다. */
	public static UnitResident register(Resident resident, Unit unit, String relationType, boolean representative, OffsetDateTime at) {
		if (!resident.getPropertyId().equals(unit.getPropertyId()) || unit.getDeletedAt() != null
			|| !java.util.Set.of("OWNER", "TENANT", "FAMILY", "OTHER").contains(relationType)) {
			throw new IllegalArgumentException("Invalid resident affiliation");
		}
		var relation = new UnitResident();
		relation.id = UUID.randomUUID();
		relation.propertyId = resident.getPropertyId();
		relation.residentId = resident.getId();
		relation.unitId = unit.getId();
		relation.relationType = relationType;
		relation.householdRep = representative;
		relation.status = "ACTIVE";
		relation.createdAt = Objects.requireNonNull(at);
		relation.updatedAt = at;
		return relation;
	}
}
