package com.moahome.server.billing.domain;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(name = "billing_additions")
public class BillingAddition {
	@Id
	private UUID id;

	@Column(name = "property_id", nullable = false)
	private UUID propertyId;

	@Column(name = "billing_period_id", nullable = false)
	private UUID billingPeriodId;

	@Column(name = "template_id", nullable = false)
	private UUID templateId;

	@Column(name = "request_id", nullable = false)
	private UUID requestId;

	@Column(name = "request_fingerprint", nullable = false, length = 64)
	private String requestFingerprint;

	@Column(name = "created_by", nullable = false)
	private UUID createdBy;

	@Column(name = "created_at", nullable = false)
	private OffsetDateTime createdAt;

	protected BillingAddition() {
	}

	/** 같은 요청의 재시도와 새로운 추가 부과를 구분할 근거를 청구 생성과 같은 트랜잭션에 보존합니다. */
	public static BillingAddition create(BillingPeriod period, FeeTemplate template, UUID requestId,
	    String fingerprint, UUID actor, OffsetDateTime at) {
		if (!period.getPropertyId().equals(template.getPropertyId()) || template.isDefaultTemplate())
			throw new IllegalArgumentException("Invalid billing addition source");
		var addition = new BillingAddition();
		addition.id = UUID.randomUUID();
		addition.propertyId = period.getPropertyId();
		addition.billingPeriodId = period.getId();
		addition.templateId = template.getId();
		addition.requestId = Objects.requireNonNull(requestId);
		addition.requestFingerprint = Objects.requireNonNull(fingerprint);
		addition.createdBy = Objects.requireNonNull(actor);
		addition.createdAt = Objects.requireNonNull(at);
		return addition;
	}
}
