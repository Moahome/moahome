package com.moahome.server.accounting.domain;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;

@Getter
@Entity
@Table(name = "expense_accounting_reviews")
public class ExpenseAccountingReview {
	@Id
	private UUID id;

	@Column(nullable = false)
	private UUID propertyId;

	@Column(nullable = false)
	private UUID expenseId;

	@Column(nullable = false)
	private UUID accountId;

	@Column(nullable = false)
	private LocalDate recognitionMonth;

	@Column(nullable = false)
	private int revision;

	@Column(nullable = false, columnDefinition = "text")
	private String reasonEncrypted;

	@Column(nullable = false)
	private UUID confirmedBy;

	@Column(nullable = false)
	private OffsetDateTime confirmedAt;

	protected ExpenseAccountingReview() {
	}

	/** 출금 원본은 바꾸지 않고 확인한 과목·귀속 월과 정정 사유를 매 버전 추가해 보존합니다. */
	public static ExpenseAccountingReview create(UUID property, UUID expense, AccountingAccount account,
		YearMonth month, int revision, String encryptedReason, UUID actor, OffsetDateTime at) {
		if (!property.equals(account.getPropertyId()) || !account.getReportGroup().isExpense() || revision < 1)
			throw new IllegalArgumentException("Invalid expense review");
		ExpenseAccountingReview review = new ExpenseAccountingReview();
		review.id = UUID.randomUUID();
		review.propertyId = property;
		review.expenseId = expense;
		review.accountId = account.getId();
		review.recognitionMonth = month.atDay(1);
		review.revision = revision;
		review.reasonEncrypted = encryptedReason;
		review.confirmedBy = actor;
		review.confirmedAt = at;
		return review;
	}
}
