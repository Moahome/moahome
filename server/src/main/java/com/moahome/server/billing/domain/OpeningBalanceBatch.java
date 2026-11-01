package com.moahome.server.billing.domain;

import java.time.*;
import java.util.*;

import jakarta.persistence.*;
import lombok.Getter;

import com.moahome.server.common.validation.TextValues;

@Getter
@Entity
@Table(name = "opening_balance_batches")
public class OpeningBalanceBatch {
	@Id
	private UUID id;

	@Column(name = "property_id", nullable = false)
	private UUID propertyId;

	@Column(name = "cutoff_date", nullable = false)
	private LocalDate cutoffDate;

	@Column(name = "first_billing_month", nullable = false)
	private LocalDate firstBillingMonth;

	@Column(nullable = false, length = 20)
	private String status;

	@Version
	private long revision;

	@Column(name = "edit_token", nullable = false)
	private UUID editToken;

	@Column(name = "created_by", nullable = false)
	private UUID createdBy;

	@Column(name = "created_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	@Column(name = "confirmed_by")
	private UUID confirmedBy;

	@Column(name = "confirmed_at", columnDefinition = "timestamptz")
	private OffsetDateTime confirmedAt;

	@Column(name = "canceled_by")
	private UUID canceledBy;

	@Column(name = "canceled_at", columnDefinition = "timestamptz")
	private OffsetDateTime canceledAt;

	@Column(name = "cancel_reason", length = 500)
	private String cancelReason;

	protected OpeningBalanceBatch() {
	}

	/** 작업 ID는 서버에서 발급하고 확정 전까지 기준일·첫 부과월을 편집합니다. */
	public static OpeningBalanceBatch draft(UUID property, LocalDate cutoff, YearMonth first, UUID actor,
	    OffsetDateTime at) {
		var batch = new OpeningBalanceBatch();
		batch.id = UUID.randomUUID();
		batch.propertyId = property;
		batch.status = "DRAFT";
		batch.createdBy = actor;
		batch.createdAt = at;
		batch.revise(cutoff, first);
		return batch;
	}

	public void revise(LocalDate cutoff, YearMonth first) {
		if (!"DRAFT".equals(status) || !BillingCalendar.validStart(cutoff, first))
			throw new IllegalArgumentException("Invalid handover dates");
		cutoffDate = Objects.requireNonNull(cutoff);
		firstBillingMonth = first.atDay(1);
		editToken = UUID.randomUUID();
	}

	/** 초기 기준 정정은 확정 상태와 첫 부과월을 보존합니다. 전후 값은 별도 불변 이력에 저장합니다. */
	public void correctInitialCutoff(LocalDate cutoff) {
		if (!"CONFIRMED".equals(status) || !BillingCalendar.validStart(cutoff, YearMonth.from(firstBillingMonth)))
			throw new IllegalArgumentException("Invalid initial cutoff");
		cutoffDate = cutoff;
		editToken = UUID.randomUUID();
	}

	/** 통장 기준일 정정에 동의한 경우에만 부과월도 함께 갱신하며 확정 원본 상태는 유지합니다. */
	public void correctInitialStart(LocalDate cutoff, YearMonth first) {
		if (!"CONFIRMED".equals(status) || !BillingCalendar.validStart(cutoff, first))
			throw new IllegalArgumentException("Invalid initial start");
		cutoffDate = cutoff;
		firstBillingMonth = first.atDay(1);
		editToken = UUID.randomUUID();
	}

	/** 확정 이력은 보존하고 재요청에서는 같은 작업의 확정 결과를 반환합니다. */
	public void confirm(UUID actor, OffsetDateTime at) {
		if (!"DRAFT".equals(status))
			throw new IllegalStateException("Opening batch is not a draft");
		status = "CONFIRMED";
		confirmedBy = actor;
		confirmedAt = at;
	}

	/** 사용된 수납이 없는지는 서비스에서 검증하며 취소 사유에는 개인정보를 적지 않습니다. */
	public void cancel(UUID actor, String reason, OffsetDateTime at) {
		if (!"CONFIRMED".equals(status))
			throw new IllegalStateException("Opening batch is not confirmed");
		status = "CANCELED";
		canceledBy = actor;
		canceledAt = at;
		cancelReason = TextValues.required(reason, 500);
	}
}
