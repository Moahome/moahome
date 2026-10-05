package com.moahome.server.billing.domain;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Objects;
import java.util.UUID;
import com.moahome.server.common.validation.TextValues;

import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(name = "fee_templates")
public class FeeTemplate {
	@Id
	@Column(nullable = false, updatable = false)
	private UUID id;

	@Column(name = "property_id", nullable = false, updatable = false)
	private UUID propertyId;

	@Column(nullable = false, length = 100)
	private String name;

	@Column(name = "is_default", nullable = false)
	private boolean defaultTemplate;

	@Column(name = "effective_from")
	private java.time.LocalDate effectiveFrom;

	@Column(name = "effective_to")
	private java.time.LocalDate effectiveTo;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private FeeTemplateStatus status;

	@Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime updatedAt;

	@Column(name = "deleted_at", columnDefinition = "timestamptz")
	private OffsetDateTime deletedAt;

	@Column(name = "deleted_by")
	private UUID deletedBy;

	protected FeeTemplate() {
	}

	/** 실제 청구를 만들지 않고 후속 월별 부과에 사용할 기본 항목 묶음을 생성합니다. */
	public static FeeTemplate createDefault(UUID propertyId, OffsetDateTime at) {
		FeeTemplate template = new FeeTemplate();
		template.propertyId = Objects.requireNonNull(propertyId);
		template.name = "기본 관리비";
		template.defaultTemplate = true;
		template.status = FeeTemplateStatus.ACTIVE;
		template.initialize(at);
		return template;
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
