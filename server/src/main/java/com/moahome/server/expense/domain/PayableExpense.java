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
import com.moahome.server.accounting.exception.AccountingException;

@Getter
@Entity
@Table(name = "payable_expenses")
public class PayableExpense {
	@Id
	private UUID id;
	private UUID propertyId;
	private UUID expenseAccountId;
	private UUID payableAccountId;
	private UUID buildingId;
	private LocalDate occurredDate;
	@Column(columnDefinition = "text")
	private String nameEncrypted;
	@Column(columnDefinition = "text")
	private String counterpartyEncrypted;
	@Column(columnDefinition = "text")
	private String memoEncrypted;
	@Column(precision = 15, scale = 0)
	private BigDecimal amount;
	private String status;
	private UUID createdBy;
	@Column(columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;
	private UUID canceledBy;
	@Column(columnDefinition = "timestamptz")
	private OffsetDateTime canceledAt;

	protected PayableExpense() {
	}

	/** 미지급 발생만 기록하며 통장 거래·지출 원본을 생성하지 않습니다. */
	public static PayableExpense create(UUID id, UUID property, UUID expenseAccount, UUID payableAccount,
		UUID building, LocalDate date, String name, String counterparty, String memo, BigDecimal amount,
		UUID actor, OffsetDateTime at) {
		if (amount == null || amount.signum() <= 0 || amount.scale() != 0 || amount.precision() > 15)
			throw new AccountingException("INVALID_PAYABLE_AMOUNT");
		PayableExpense value = new PayableExpense();
		value.id = id;
		value.propertyId = property;
		value.expenseAccountId = expenseAccount;
		value.payableAccountId = payableAccount;
		value.buildingId = building;
		value.occurredDate = date;
		value.nameEncrypted = name;
		value.counterpartyEncrypted = counterparty;
		value.memoEncrypted = memo;
		value.amount = amount;
		value.status = "REGISTERED";
		value.createdBy = actor;
		value.createdAt = at;
		return value;
	}

	/** 지급 연결을 모두 해제한 등록만 취소하고 원본 금액·계정·발생일은 보존합니다. */
	public void cancel(BigDecimal paid, UUID actor, OffsetDateTime at) {
		if (paid.signum() != 0)
			throw new AccountingException("PAYABLE_HAS_PAYMENTS");
		if ("CANCELED".equals(status))
			return;
		status = "CANCELED";
		canceledBy = actor;
		canceledAt = at;
	}
}
