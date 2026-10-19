package com.moahome.server.banking.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;

/** 기타 입금의 당시 동별 귀속을 보존합니다. 수납 취소·원본 삭제 시 유효 집계에서 제외합니다. */
@Getter
@Entity
@Table(name = "income_allocations")
public class IncomeAllocation {
	@Id
	private UUID id;

	@Column(name = "property_id", nullable = false)
	private UUID propertyId;

	@Column(name = "payment_id", nullable = false)
	private UUID paymentId;

	@Column(name = "building_id", nullable = false)
	private UUID buildingId;

	@Column(name = "building_label_encrypted", nullable = false, columnDefinition = "text")
	private String buildingLabelEncrypted;

	@Column(nullable = false, precision = 15, scale = 0)
	private BigDecimal amount;

	@Column(precision = 5, scale = 2)
	private BigDecimal percentage;

	@Column(name = "allocation_mode", nullable = false, length = 20)
	private String allocationMode;

	@Column(name = "sort_order", nullable = false)
	private int sortOrder;

	@Column(name = "created_by", nullable = false)
	private UUID createdBy;

	@Column(name = "created_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	protected IncomeAllocation() {
	}

	public static IncomeAllocation create(UUID property, UUID payment, UUID building, String label, BigDecimal amount,
	    BigDecimal percentage, String mode, int order, UUID actor, OffsetDateTime at) {
		var a = new IncomeAllocation();
		a.id = UUID.randomUUID();
		a.propertyId = property;
		a.paymentId = payment;
		a.buildingId = building;
		a.buildingLabelEncrypted = label;
		a.amount = amount;
		a.percentage = percentage;
		a.allocationMode = mode;
		a.sortOrder = order;
		a.createdBy = actor;
		a.createdAt = at;
		return a;
	}
}
