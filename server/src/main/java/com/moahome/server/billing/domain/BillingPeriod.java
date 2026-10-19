package com.moahome.server.billing.domain;

import java.time.*;
import java.util.*;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(name = "billing_periods")
public class BillingPeriod {
	@Id
	private UUID id;

	@Column(name = "property_id", nullable = false)
	private UUID propertyId;

	@Column(name = "billing_year", nullable = false)
	private short billingYear;

	@Column(name = "billing_month", nullable = false)
	private short billingMonth;

	@Column(name = "billing_date", nullable = false)
	private LocalDate billingDate;

	@Column(name = "default_due_date", nullable = false)
	private LocalDate defaultDueDate;

	@Column(nullable = false, length = 20)
	private String status;

	@Column(name = "confirmed_at", columnDefinition = "timestamptz")
	private OffsetDateTime confirmedAt;

	@Column(name = "confirmation_source", nullable = false, length = 20)
	private String confirmationSource;

	@Column(name = "recorded_by")
	private UUID recordedBy;

	@Column(name = "created_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime updatedAt;

	protected BillingPeriod() {
	}

	/** 생성 단계와 자동 확정을 구분하되 같은 트랜잭션에서 완료해 미완성 청구를 공개하지 않습니다. */
	public static BillingPeriod draft(UUID propertyId, YearMonth month, OffsetDateTime at) {
		var period = new BillingPeriod();
		period.id = UUID.randomUUID();
		period.propertyId = Objects.requireNonNull(propertyId);
		period.billingYear = (short) month.getYear();
		period.billingMonth = (short) month.getMonthValue();
		period.billingDate = month.atDay(1);
		period.defaultDueDate = month.atEndOfMonth();
		period.status = "DRAFT";
		period.confirmationSource = "SCHEDULE";
		period.createdAt = at;
		period.updatedAt = at;
		return period;
	}

	public void confirm(OffsetDateTime at) {
		if (!"DRAFT".equals(status))
			throw new IllegalStateException("Period already issued");
		Objects.requireNonNull(at);
		status = "ISSUED";
		confirmedAt = at;
		updatedAt = at;
	}

	public YearMonth month() {
		return YearMonth.of(billingYear, billingMonth);
	}
}
