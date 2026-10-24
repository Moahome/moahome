package com.moahome.server.banking.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.*;
import jakarta.persistence.*;
import lombok.Getter;

/** 운영 중 확인한 잔액은 계산 시작값과 분리하고 취소 감사만 한 번 기록합니다. */
@Getter
@Entity
@Table(name = "bank_balance_checks")
public class BankBalanceCheck {
	@Id
	private UUID id;

	@Column(name = "property_id", nullable = false)
	private UUID propertyId;

	@Column(name = "bank_account_id", nullable = false)
	private UUID bankAccountId;

	@Column(name = "balance_amount", nullable = false, precision = 15, scale = 0)
	private BigDecimal balanceAmount;

	@Column(name = "checked_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime checkedAt;

	@Column(name = "source_type", nullable = false)
	private String sourceType;

	@Column(name = "checked_by", nullable = false)
	private UUID checkedBy;

	@Column(name = "memo_encrypted")
	private String memoEncrypted;

	@Column(name = "created_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	@Column(name = "canceled_at", columnDefinition = "timestamptz")
	private OffsetDateTime canceledAt;

	@Column(name = "canceled_by")
	private UUID canceledBy;

	@Column(name = "cancel_request_id")
	private UUID cancelRequestId;

	@Column(name = "cancel_reason_encrypted")
	private String cancelReasonEncrypted;

	protected BankBalanceCheck() {
	}

	/** 실잔액을 원 단위로 보존하며 수납·지출·동별 기준값은 생성하지 않습니다. */
	public static BankBalanceCheck create(UUID id, UUID property, UUID account, BigDecimal amount,
	    OffsetDateTime checkedAt, String source, UUID actor, String memo, OffsetDateTime now) {
		if (amount == null || amount.signum() < 0 || amount.scale() != 0 || amount.precision() > 15
		    || !Set.of("BANK_APP", "INTERNET_BANKING", "OTHER").contains(source))
			throw new IllegalArgumentException("Invalid balance check");
		BankBalanceCheck row = new BankBalanceCheck();
		row.id = Objects.requireNonNull(id);
		row.propertyId = Objects.requireNonNull(property);
		row.bankAccountId = Objects.requireNonNull(account);
		row.balanceAmount = amount;
		row.checkedAt = Objects.requireNonNull(checkedAt);
		row.sourceType = source;
		row.checkedBy = Objects.requireNonNull(actor);
		row.memoEncrypted = memo;
		row.createdAt = Objects.requireNonNull(now);
		return row;
	}

	/** 원문을 유지한 채 유효 확인값에서 제외하며 재시도로 취소를 되돌리지 않습니다. */
	public void cancel(UUID request, UUID actor, String reason, OffsetDateTime now) {
		if (canceledAt != null)
			throw new IllegalStateException("Balance check already canceled");
		cancelRequestId = Objects.requireNonNull(request);
		canceledBy = Objects.requireNonNull(actor);
		cancelReasonEncrypted = Objects.requireNonNull(reason);
		canceledAt = Objects.requireNonNull(now);
	}
}
