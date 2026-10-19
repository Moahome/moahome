package com.moahome.server.banking.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;
import com.moahome.server.payment.exception.PaymentException;

@Getter
@Entity
@Table(name = "external_settlement_links")
public class ExternalSettlementLink {
	@Id
	private UUID id;

	@Column(name = "property_id", nullable = false)
	private UUID propertyId;

	@Column(name = "allocation_id", nullable = false)
	private UUID allocationId;

	@Column(name = "payment_id", nullable = false)
	private UUID paymentId;

	@Column(nullable = false, precision = 15, scale = 0)
	private BigDecimal amount;

	@Column(name = "created_by", nullable = false)
	private UUID createdBy;

	@Column(name = "created_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	protected ExternalSettlementLink() {
	}

	/** 요청 ID로 재시도를 식별하며 외부 부담액·입금 잔여 한도는 잠금을 가진 서비스가 함께 검증합니다. */
	public static ExternalSettlementLink create(UUID id, UUID property, UUID allocation, UUID payment, String amount,
	    UUID actor, OffsetDateTime at) {
		if (amount == null || !amount.matches("[0-9]{1,15}") || new BigDecimal(amount).signum() <= 0)
			throw new PaymentException("INVALID_EXTERNAL_SETTLEMENT");
		var row = new ExternalSettlementLink();
		row.id = id;
		row.propertyId = property;
		row.allocationId = allocation;
		row.paymentId = payment;
		row.amount = new BigDecimal(amount);
		row.createdBy = actor;
		row.createdAt = at;
		return row;
	}
}
