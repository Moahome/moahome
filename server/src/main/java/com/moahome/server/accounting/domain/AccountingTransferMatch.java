package com.moahome.server.accounting.domain;

import java.util.UUID;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;

/** 이미 장부에 반영된 두 실제 거래를 103으로 연결하며 현금 거래·배분 원본을 변경하지 않습니다. */
@Getter
@Entity
@Table(name = "accounting_transfer_matches")
public class AccountingTransferMatch {
	@Id
	private UUID reviewId;
	private UUID propertyId;
	private UUID expenseId;
	private UUID paymentId;

	protected AccountingTransferMatch() {
	}

	/** 최신 분류 revision에 연결을 고정해 비용 과목으로 재정정하면 이전 이체 연결은 이력으로 남습니다. */
	public static AccountingTransferMatch create(ExpenseAccountingReview review, UUID payment) {
		AccountingTransferMatch result = new AccountingTransferMatch();
		result.reviewId = review.getId();
		result.propertyId = review.getPropertyId();
		result.expenseId = review.getExpenseId();
		result.paymentId = payment;
		return result;
	}
}
