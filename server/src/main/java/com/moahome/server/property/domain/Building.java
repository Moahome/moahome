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
@Table(name = "buildings")
public class Building {
	@Id
	@Column(nullable = false, updatable = false)
	private UUID id;

	@Column(name = "property_id", nullable = false, updatable = false)
	private UUID propertyId;

	@Column(nullable = false, length = 50)
	private String name;

	@Column(name = "sort_order", nullable = false)
	private int sortOrder;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private BuildingStatus status;

	@Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime updatedAt;

	@Column(name = "deleted_at", columnDefinition = "timestamptz")
	private OffsetDateTime deletedAt;

	@Column(name = "deleted_by")
	private UUID deletedBy;

	protected Building() {
	}

	/** 접미사가 없는 숫자·문자 동 이름도 같은 저장 이름으로 정리해 요청의 중복 검증과 공유합니다. */
	public static String normalizeName(String name) {
		String normalized = TextValues.strip(name);
		if (normalized == null || normalized.isEmpty() || normalized.endsWith("동")) return normalized;
		return normalized + "동";
	}

	/** 동 구분이 있는 관리대상에만 동을 만들고 입력 순서를 보존합니다. */
	public static Building create(Property property, String name, int sortOrder, OffsetDateTime at) {
		if (!property.isHasBuildings() || sortOrder < 0) {
			throw new IllegalArgumentException("Invalid building configuration");
		}
		Building building = new Building();
		building.propertyId = property.getId();
		building.name = TextValues.required(normalizeName(name), 50);
		building.sortOrder = sortOrder;
		building.status = BuildingStatus.ACTIVE;
		building.initialize(at);
		return building;
	}

	/** 동의 식별자와 연결된 세대는 유지하고 활성 동의 현재 이름만 변경합니다. */
	public void rename(String name) {
		if (deletedAt != null || status != BuildingStatus.ACTIVE) {
			throw new IllegalArgumentException("Building is not editable");
		}
		this.name = TextValues.required(normalizeName(name), 50);
	}

	/** 목록에서 제외하되 기존 ID와 연결 기록을 보존하며 재요청에는 최초 삭제 정보를 유지합니다. */
	public void softDelete(UUID actorId, OffsetDateTime at) {
		if (deletedAt != null) return;
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
