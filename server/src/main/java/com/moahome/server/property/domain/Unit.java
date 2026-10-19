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
		Unit unit = new Unit();
		unit.applyDetails(property, building, unitNumber, displayName, floor, status);
		unit.initialize(at);
		return unit;
	}

	/** 동일 세대의 기본 정보만 정정하며 ID와 다른 업무 레코드의 세대 연결은 유지합니다. */
	public void updateDetails(Property property, Building building, String unitNumber, String displayName,
	    Integer floor, UnitStatus status) {
		if (!propertyId.equals(property.getId()) || deletedAt != null || this.status == UnitStatus.INACTIVE) {
			throw new IllegalArgumentException("Invalid unit update");
		}
		applyDetails(property, building, unitNumber, displayName, floor, status);
	}

	/** 생성·수정 모두 같은 동 소속·문자열·층 범위를 검증하며 비활성화는 별도 정책 확정 전까지 제외합니다. */
	private void applyDetails(Property property, Building building, String unitNumber, String displayName,
	    Integer floor, UnitStatus status) {
		if (property.isHasBuildings() != (building != null)
		    || (building != null && !property.getId().equals(building.getPropertyId()))
		    || (floor != null && (floor < Short.MIN_VALUE || floor > Short.MAX_VALUE))) {
			throw new IllegalArgumentException("Invalid unit configuration");
		}
		String normalizedNumber = TextValues.required(unitNumber, 30);
		// 주민 관계·권한은 유지하며 당월 부과 대상 변경은 서비스가 같은 트랜잭션에서 조율합니다.
		if (status == UnitStatus.INACTIVE) {
			throw new IllegalArgumentException("Invalid initial unit configuration");
		}
		String normalizedDisplayName = TextValues.optional(displayName, 50);
		UnitStatus normalizedStatus = Objects.requireNonNull(status);
		// 모든 입력 검증을 마친 뒤 값을 반영해 실패한 정정으로 일부 필드만 바뀌지 않게 합니다.
		this.propertyId = property.getId();
		this.buildingId = building == null ? null : building.getId();
		this.unitNumber = normalizedNumber;
		this.displayName = normalizedDisplayName;
		this.floor = floor == null ? null : floor.shortValue();
		this.status = normalizedStatus;
	}

	/** 목록에서 제외하되 기존 ID와 연결 기록을 보존하며 재요청에는 최초 삭제 정보를 유지합니다. */
	public void softDelete(UUID actorId, OffsetDateTime at) {
		if (deletedAt != null)
			return;
		Objects.requireNonNull(actorId);
		Objects.requireNonNull(at);
		deletedBy = actorId;
		deletedAt = at;
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
