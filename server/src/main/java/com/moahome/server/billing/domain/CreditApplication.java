package com.moahome.server.billing.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.*;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(name = "credit_applications")
public class CreditApplication {
	@Id
	private UUID id;

	@Column(name = "property_id", nullable = false)
	private UUID propertyId;

	@Column(name = "opening_item_id", nullable = false)
	private UUID openingItemId;

	@Column(name = "charge_id", nullable = false)
	private UUID chargeId;

	@Column(nullable = false, precision = 15, scale = 0)
	private BigDecimal amount;

	@Column(nullable = false, length = 20)
	private String status;

	@Column(name = "applied_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime appliedAt;

	@Column(name = "applied_by", nullable = false)
	private UUID appliedBy;

	protected CreditApplication() {
	}

	/** 실제 은행 입금 없이 기존 선납금을 청구에 충당한 근거를 보존합니다. */
	public static CreditApplication apply(OpeningBalanceItem source, Charge charge, BigDecimal amount, UUID actor,
	    OffsetDateTime at) {
		if (!source.getPropertyId().equals(charge.getPropertyId()) || !source.getUnitId().equals(charge.getUnitId())
		    || amount.signum() <= 0)
			throw new IllegalArgumentException("Invalid credit application");
		var application = new CreditApplication();
		application.id = UUID.randomUUID();
		application.propertyId = source.getPropertyId();
		application.openingItemId = source.getId();
		application.chargeId = charge.getId();
		application.amount = amount;
		application.status = "ACTIVE";
		application.appliedAt = at;
		application.appliedBy = actor;
		return application;
	}

	/** 재충당은 같은 원본·청구의 행에서 증가시키며 원본 잔액은 별도 중복 컬럼 없이 계산합니다. */
	public void increase(BigDecimal extra) {
		if (!"ACTIVE".equals(status) || extra.signum() <= 0)
			throw new IllegalArgumentException("Invalid credit");
		amount = amount.add(extra);
	}

	public void cancel() {
		status = "CANCELED";
	}
}
