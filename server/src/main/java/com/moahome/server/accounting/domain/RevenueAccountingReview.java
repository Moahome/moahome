package com.moahome.server.accounting.domain;

import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;

@Getter
@Entity
@Table(name = "revenue_accounting_reviews")
public class RevenueAccountingReview {
	@Id
	private UUID id;

	@Column(nullable = false)
	private UUID propertyId;

	@Column(nullable = false)
	private UUID sourceTemplateItemId;

	@Column(nullable = false)
	private boolean recognized;

	@Column(nullable = false)
	private int revision;

	@Column(nullable = false, columnDefinition = "text")
	private String reasonEncrypted;

	@Column(nullable = false)
	private UUID confirmedBy;

	@Column(nullable = false)
	private OffsetDateTime confirmedAt;

	protected RevenueAccountingReview() {
	}

	/** 같은 부과 항목의 기존 확정 부과를 일반 관리비수익으로 볼지 명시적으로 확인하고 정정 이력을 추가합니다. */
	public static RevenueAccountingReview create(UUID property, UUID item, boolean recognized, int revision,
		String reason, UUID actor, OffsetDateTime at) {
		if (revision < 1)
			throw new IllegalArgumentException("Invalid revenue revision");
		RevenueAccountingReview review = new RevenueAccountingReview();
		review.id = UUID.randomUUID();
		review.propertyId = property;
		review.sourceTemplateItemId = item;
		review.recognized = recognized;
		review.revision = revision;
		review.reasonEncrypted = reason;
		review.confirmedBy = actor;
		review.confirmedAt = at;
		return review;
	}
}
