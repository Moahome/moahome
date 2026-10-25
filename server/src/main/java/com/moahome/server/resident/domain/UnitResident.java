package com.moahome.server.resident.domain;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import jakarta.persistence.*;
import lombok.Getter;

import com.moahome.server.property.domain.Unit;

@Getter
@Entity
@Table(name = "unit_residents")
public class UnitResident {
	@Id
	private UUID id;

	@Column(name = "property_id", nullable = false)
	private UUID propertyId;

	@Column(name = "unit_id", nullable = false)
	private UUID unitId;

	@Column(name = "resident_id", nullable = false)
	private UUID residentId;

	@Column(name = "relation_type", nullable = false, length = 20)
	private String relationType;

	@Column(name = "is_household_rep", nullable = false)
	private boolean householdRep;

	@Column(nullable = false, length = 20)
	private String status;

	@Column(name = "created_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime updatedAt;

	@Column(name = "deleted_at", columnDefinition = "timestamptz")
	private OffsetDateTime deletedAt;

	@Column(name = "deleted_by")
	private UUID deletedBy;

	@Column(name = "move_out_date")
	private LocalDate moveOutDate;

	protected UnitResident() {
	}

	/** 같은 세대에서 주민 구분만 바꾸며 대표 여부는 임의로 변경하지 않습니다. */
	public void changeRelation(String relation, OffsetDateTime at) {
		if (!Set.of("OWNER", "TENANT", "FAMILY", "OTHER").contains(relation))
			throw new IllegalArgumentException("Invalid relation");
		relationType = relation;
		updatedAt = at;
	}

	/** 관리소장이 선택한 주민에게만 대표를 넘기며 자동 승계하지 않습니다. */
	public void designateRepresentative(OffsetDateTime at) {
		householdRep = true;
		updatedAt = at;
	}

	/** 명부 삭제는 삭제 표시로 제외하며 실제 세대 이동·본인 퇴거에서 퇴거 상태·날짜를 기록합니다. */
	public void end(UUID actor, OffsetDateTime at, boolean deleted) {
		updatedAt = at;
		if (deleted) {
			deletedAt = at;
			deletedBy = actor;
			return;
		}
		status = "MOVED_OUT";
		moveOutDate = at.toLocalDate();
	}

	/** 같은 관리대상의 신규 주민과 기존 세대만 연결하며 대표 여부는 잠금 아래 최초 등록 판정으로 전달받습니다. */
	public static UnitResident register(Resident resident, Unit unit, String relationType, boolean representative,
	    OffsetDateTime at) {
		if (!resident.getPropertyId().equals(unit.getPropertyId()) || unit.getDeletedAt() != null
		    || !Set.of("OWNER", "TENANT", "FAMILY", "OTHER").contains(relationType)) {
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
