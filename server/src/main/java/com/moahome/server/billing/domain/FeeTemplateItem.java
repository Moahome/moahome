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
@Table(name = "fee_template_items")
public class FeeTemplateItem {
	@Id
	@Column(nullable = false, updatable = false)
	private UUID id;

	@Column(name = "fee_template_id", nullable = false, updatable = false)
	private UUID feeTemplateId;

	@Column(name = "item_code", length = 30)
	private String itemCode;

	@Column(name = "item_name", nullable = false, length = 100)
	private String itemName;

	@Column(name = "default_amount", nullable = false, precision = 15, scale = 0)
	private java.math.BigDecimal defaultAmount;

	@Column(name = "revenue_account_id")
	private UUID revenueAccountId;

	@Column(name = "sort_order", nullable = false)
	private int sortOrder;

	@Column(name = "is_active", nullable = false)
	private boolean active;

	@Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime updatedAt;

	@Column(name = "deleted_at", columnDefinition = "timestamptz")
	private OffsetDateTime deletedAt;

	@Column(name = "deleted_by")
	private UUID deletedBy;

	protected FeeTemplateItem() {
	}

	/** 정수 원 단위와 저장 범위를 검증하고 항목 순서를 보존합니다. */
	public static FeeTemplateItem create(FeeTemplate template, String itemName, long amount, int sortOrder,
		OffsetDateTime at) {
		if (amount < 0 || amount > 999_999_999_999_999L || sortOrder < 0) {
			throw new IllegalArgumentException("Invalid fee item configuration");
		}
		FeeTemplateItem item = new FeeTemplateItem();
		item.feeTemplateId = template.getId();
		item.itemName = TextValues.required(itemName, 100);
		item.defaultAmount = java.math.BigDecimal.valueOf(amount);
		item.sortOrder = sortOrder;
		item.active = true;
		item.initialize(at);
		return item;
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
