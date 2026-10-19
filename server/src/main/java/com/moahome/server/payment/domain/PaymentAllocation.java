package com.moahome.server.payment.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(name = "payment_allocations")
public class PaymentAllocation {
	@Id
	private UUID id;

	@Column(name = "property_id", nullable = false)
	private UUID propertyId;

	@Column(name = "payment_id", nullable = false)
	private UUID paymentId;

	@Column(name = "charge_id", nullable = false)
	private UUID chargeId;

	@Column(name = "allocated_amount", nullable = false, precision = 15, scale = 0)
	private BigDecimal allocatedAmount;

	@Column(nullable = false, length = 20)
	private String status;

	@Column(name = "allocated_by", nullable = false)
	private UUID allocatedBy;

	@Column(name = "allocated_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime allocatedAt;

	@Column(name = "canceled_by")
	private UUID canceledBy;

	@Column(name = "canceled_at", columnDefinition = "timestamptz")
	private OffsetDateTime canceledAt;

	protected PaymentAllocation() {
	}

	/** 0원은 배분 레코드를 만들지 않으며 양수 원 단위만 청구에 연결합니다. */
	public static PaymentAllocation allocate(Payment p, UUID charge, BigDecimal amount, UUID actor, OffsetDateTime at) {
		if (!"CONFIRMED".equals(p.getStatus()) || amount.signum() <= 0 || amount.scale() != 0
		    || amount.compareTo(p.getAmount()) > 0)
			throw new IllegalArgumentException("Invalid allocation");
		var a = new PaymentAllocation();
		a.id = UUID.randomUUID();
		a.propertyId = p.getPropertyId();
		a.paymentId = p.getId();
		a.chargeId = charge;
		a.allocatedAmount = amount;
		a.status = "ACTIVE";
		a.allocatedBy = actor;
		a.allocatedAt = at;
		return a;
	}

	public void cancel(UUID actor, OffsetDateTime at) {
		if ("CANCELED".equals(status))
			return;
		status = "CANCELED";
		canceledBy = actor;
		canceledAt = at;
	}

	/** 기존 충당을 유지하면서 추가 선입금만 반영하며 변경 전·추가 금액은 서비스의 처리 이벤트에 보존합니다. */
	public void increase(BigDecimal amount) {
		if (!"ACTIVE".equals(status) || amount.signum() <= 0 || amount.scale() != 0)
			throw new IllegalArgumentException("Invalid allocation increase");
		allocatedAmount = allocatedAmount.add(amount);
	}
}
