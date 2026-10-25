package com.moahome.server.billing.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.*;
import lombok.Getter;

import com.moahome.server.common.validation.TextValues;

@Getter
@Entity
@Table(name = "fee_template_items")
public class FeeTemplateItem {
	@Id
	@Column(nullable = false, updatable = false)
	private UUID id;

	@Column(name = "fee_template_id", nullable = false, updatable = false)
	private UUID feeTemplateId;

	@Column(name = "property_id", nullable = false, updatable = false)
	private UUID propertyId;

	@Column(name = "building_id")
	private UUID buildingId;

	@Column(name = "is_temporary", nullable = false)
	private boolean temporary;

	@Column(length = 500)
	private String note;

	@Enumerated(EnumType.STRING)
	@Column(name = "item_code", length = 30)
	private FeeItemCode itemCode;

	@Column(name = "item_name", nullable = false, length = 100)
	private String itemName;

	@Column(name = "default_amount", nullable = false, precision = 15, scale = 0)
	private BigDecimal defaultAmount;

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

	/** 선택한 종류와 표시 이름을 별도로 보존하고 정수 원 단위·저장 범위·항목 순서를 검증합니다. */
	public static FeeTemplateItem create(FeeTemplate template, FeeItemCode itemCode, String itemName, long amount,
	    int sortOrder, OffsetDateTime at) {
		if (amount < -999_999_999_999_999L || amount > 999_999_999_999_999L || sortOrder < 0) {
			throw new IllegalArgumentException("Invalid fee item configuration");
		}
		FeeTemplateItem item = new FeeTemplateItem();
		item.feeTemplateId = template.getId();
		item.propertyId = template.getPropertyId();
		// 직접 입력과 기존 항목은 null을 유지하며 표시 이름으로 종류를 추측하지 않습니다.
		item.itemCode = itemCode;
		item.itemName = TextValues.required(itemName, 100);
		item.defaultAmount = BigDecimal.valueOf(amount);
		item.sortOrder = sortOrder;
		item.active = true;
		item.initialize(at);
		return item;
	}

	/** 임시 항목도 템플릿 원본으로 보존해 확정 청구에서 출처를 추적할 수 있게 합니다. */
	public static FeeTemplateItem scoped(FeeTemplate template, FeeItemCode code, String name, long amount,
	    int order, UUID buildingId, boolean temporary, String note, OffsetDateTime at) {
		var item = create(template, code, name, amount, order, at);
		item.buildingId = buildingId;
		item.temporary = temporary;
		item.note = note == null ? null : TextValues.strip(note);
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
