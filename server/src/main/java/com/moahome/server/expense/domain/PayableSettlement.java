package com.moahome.server.expense.domain;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;

@Getter
@Entity
@Table(name = "payable_settlements")
public class PayableSettlement {
	@Id
	private UUID id;
	private UUID propertyId;
	private UUID payableId;
	private UUID expenseId;
	private LocalDate paymentDate;
	@Column(precision = 15, scale = 0)
	private BigDecimal amount;
	private String status;
	private UUID createdBy;
	@Column(columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;
	private UUID canceledBy;
	@Column(columnDefinition = "timestamptz")
	private OffsetDateTime canceledAt;

	protected PayableSettlement() {
	}

	/** 기존 지출 전액을 한 미지급금의 지급으로 연결하고 새 출금·비용을 만들지 않습니다. */
	public static PayableSettlement create(UUID id, PayableExpense payable, Expense expense, UUID actor, OffsetDateTime at) {
		PayableSettlement value = new PayableSettlement();
		value.id = id;
		value.propertyId = payable.getPropertyId();
		value.payableId = payable.getId();
		value.expenseId = expense.getId();
		value.paymentDate = expense.getExpenseDate();
		value.amount = expense.getTotalAmount();
		value.status = "ACTIVE";
		value.createdBy = actor;
		value.createdAt = at;
		return value;
	}

	/** 원본 출금은 유지하고 연결의 취소 감사만 남겨 미지급 잔액을 복원합니다. */
	public void cancel(UUID actor, OffsetDateTime at) {
		if ("CANCELED".equals(status))
			return;
		status = "CANCELED";
		canceledBy = actor;
		canceledAt = at;
	}
}
