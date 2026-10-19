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

	@Column(nullable = false)
	private long revision;

	@Column(name = "change_reason", length = 1000)
	private String changeReason;

	@Column(name = "changed_by")
	private UUID changedBy;

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
		template.effectiveFrom = at.atZoneSameInstant(BillingCalendar.ZONE).toLocalDate().withDayOfMonth(1);
		template.initialize(at);
		return template;
	}

	/** 기존 내용을 덮어쓰지 않고 다음 달부터 사용할 새 버전과 필수 수정 사유를 보존합니다. */
	public static FeeTemplate schedule(UUID propertyId, long revision, java.time.YearMonth month, String reason,
	    UUID actorId, OffsetDateTime at) {
		if (revision <= 0)
			throw new IllegalArgumentException("Invalid template revision");
		var template = createDefault(propertyId, at);
		template.revision = revision;
		template.effectiveFrom = month.atDay(1);
		template.changeReason = TextValues.required(reason, 1000);
		template.changedBy = Objects.requireNonNull(actorId);
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
