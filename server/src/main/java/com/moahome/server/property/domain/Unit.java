package com.moahome.server.property.domain;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Objects;
import java.util.UUID;
import com.moahome.server.common.validation.TextValues;

import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(name = "units")
public class Unit {
	@Id
	@Column(nullable = false, updatable = false)
	private UUID id;

	@Column(name = "property_id", nullable = false, updatable = false)
	private UUID propertyId;

	@Column(name = "building_id")
	private UUID buildingId;

	@Column(name = "unit_number", nullable = false, length = 30)
	private String unitNumber;

	@Column(name = "display_name", length = 50)
	private String displayName;

	@Column(name = "floor")
	private Short floor;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private UnitStatus status;

	@Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime updatedAt;

	@Column(name = "deleted_at", columnDefinition = "timestamptz")
	private OffsetDateTime deletedAt;

	@Column(name = "deleted_by")
	private UUID deletedBy;

	protected Unit() {
	}

	/** 동 구분과 관리대상 소속을 함께 검증해 다른 관리대상의 동 연결을 차단합니다. */
	public static Unit create(Property property, Building building, String unitNumber, String displayName,
		Integer floor, UnitStatus status, OffsetDateTime at) {
		if (property.isHasBuildings() != (building != null)
			|| (building != null && !property.getId().equals(building.getPropertyId()))
			|| (floor != null && (floor < Short.MIN_VALUE || floor > Short.MAX_VALUE))) {
			throw new IllegalArgumentException("Invalid unit configuration");
		}
		String normalizedNumber = TextValues.required(unitNumber, 30);
		// 직접 생성에서도 초기 사용중·공실 상태를 지켜 API 검증 우회를 막습니다.
		if (status == UnitStatus.INACTIVE) {
			throw new IllegalArgumentException("Invalid initial unit configuration");
		}
		Unit unit = new Unit();
		unit.propertyId = property.getId();
		unit.buildingId = building == null ? null : building.getId();
		unit.unitNumber = normalizedNumber;
		unit.displayName = TextValues.optional(displayName, 50);
		unit.floor = floor == null ? null : floor.shortValue();
		unit.status = Objects.requireNonNull(status);
		unit.initialize(at);
		return unit;
	}

	/** 신규 레코드 모두에 등록 시각을 적용해 초기 설정과 응답 시각을 일치시킵니다. */
	private void initialize(OffsetDateTime at) {
		id = UUID.randomUUID();
		createdAt = Objects.requireNonNull(at);
		updatedAt = at;
	}

	@PreUpdate
	private void updateTimestamp() {
		updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
	}
}
