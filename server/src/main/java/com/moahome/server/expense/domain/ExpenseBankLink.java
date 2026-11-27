package com.moahome.server.expense.domain;

import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;

/** 원본별 최초 연결을 보존합니다. 원본 삭제 뒤 재시도해도 이 기록으로 과거 연결을 복원하지 않습니다. */
@Getter
@Entity
@Table(name = "expense_bank_links")
public class ExpenseBankLink {
	@Id
	@Column(name = "bank_transaction_id")
	private UUID bankTransactionId;

	@Column(name = "property_id", nullable = false)
	private UUID propertyId;

	@Column(name = "expense_id", nullable = false)
	private UUID expenseId;

	@Column(name = "linked_by", nullable = false)
	private UUID linkedBy;

	@Column(name = "linked_at", nullable = false)
	private OffsetDateTime linkedAt;

	protected ExpenseBankLink() {
	}

	/** 연결의 업무 식별자는 은행 원본 ID이며 다른 지출로 덮어쓰지 않습니다. */
	public static ExpenseBankLink create(Expense expense, UUID transaction, UUID actor, OffsetDateTime at) {
		ExpenseBankLink link = new ExpenseBankLink();
		link.bankTransactionId = transaction;
		link.propertyId = expense.getPropertyId();
		link.expenseId = expense.getId();
		link.linkedBy = actor;
		link.linkedAt = at;
		return link;
	}
}
