package com.moahome.server.expense.domain;

import java.math.*;
import java.time.*;
import java.util.*;

import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.moahome.server.payment.exception.PaymentException;

@Getter
@Entity
@Table(name = "expenses")
public class Expense {
	@Id
	private UUID id;

	@Column(name = "property_id", nullable = false)
	private UUID propertyId;

	@Column(name = "bank_transaction_id")
	private UUID bankTransactionId;

	@Column(name = "source_type", nullable = false, length = 20)
	private String sourceType;

	@Column(name = "bank_account_id", nullable = false)
	private UUID bankAccountId;

	@Column(name = "expense_date", nullable = false)
	private LocalDate expenseDate;

	@Column(name = "category_encrypted", nullable = false, columnDefinition = "text")
	private String categoryEncrypted;

	@Column(name = "memo_encrypted", columnDefinition = "text")
	private String memoEncrypted;

	@Column(name = "total_amount", nullable = false, precision = 15, scale = 0)
	private BigDecimal totalAmount;

	@Column(name = "allocation_mode", nullable = false, length = 20)
	private String allocationMode;

	@Column(name = "save_as_rule", nullable = false)
	private boolean saveAsRule;

	@Column(name = "rule_key", columnDefinition = "char(64)")
	@JdbcTypeCode(SqlTypes.CHAR)
	private String ruleKey;

	@Column(name = "confirmed_by", nullable = false)
	private UUID confirmedBy;

	@Column(name = "confirmed_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime confirmedAt;

	protected Expense() {
	}

	public record Share(UUID buildingId, String label, String amount, String percentage) {
	}

	/** 원 단위 배분만 허용하며 나머지는 숨겨 배정하지 않고 직접 금액 조정을 요구합니다. */
	public static List<BigDecimal> allocate(BigDecimal total, String mode, List<Share> shares) {
		if (total == null || total.signum() <= 0 || shares == null || shares.isEmpty() || shares.size() > 100
		    || !Set.of("EQUAL", "RATIO", "AMOUNT").contains(mode))
			throw new PaymentException("INVALID_EXPENSE_ALLOCATION");
		HashSet<String> keys = new HashSet<String>();
		ArrayList<BigDecimal> result = new ArrayList<BigDecimal>();
		BigDecimal ratio = BigDecimal.ZERO;
		for (var share : shares) {
			if (share == null || share.label() == null || share.label().isBlank() || share.label().length() > 100
			    || !keys.add(
			        share.buildingId() == null ? "external:" + share.label().strip() : share.buildingId().toString()))
				throw new PaymentException("INVALID_EXPENSE_ALLOCATION");
			BigDecimal amount;
			try {
				if ("EQUAL".equals(mode))
					amount = total.divide(BigDecimal.valueOf(shares.size()), 0, RoundingMode.UNNECESSARY);
				else if ("RATIO".equals(mode)) {
					if (share.percentage() == null || !share.percentage().matches("[0-9]{1,3}(\\.[0-9]{1,2})?"))
						throw new PaymentException("INVALID_EXPENSE_ALLOCATION");
					var percentage = new BigDecimal(share.percentage());
					if (percentage.signum() <= 0 || percentage.compareTo(new BigDecimal("100")) > 0)
						throw new PaymentException("INVALID_EXPENSE_ALLOCATION");
					ratio = ratio.add(percentage);
					amount = total.multiply(percentage).divide(new BigDecimal("100"), 0, RoundingMode.UNNECESSARY);
				} else {
					if (share.amount() == null || !share.amount().matches("[0-9]{1,15}"))
						throw new PaymentException("INVALID_EXPENSE_ALLOCATION");
					amount = new BigDecimal(share.amount());
				}
			} catch (ArithmeticException exception) {
				throw new PaymentException("ALLOCATION_REMAINDER_REQUIRED");
			}
			if (amount.signum() <= 0)
				throw new PaymentException("INVALID_EXPENSE_ALLOCATION");
			result.add(amount);
		}
		if (("RATIO".equals(mode) && ratio.compareTo(new BigDecimal("100")) != 0)
		    || result.stream().reduce(BigDecimal.ZERO, (bigDecimal, next) -> bigDecimal.add(next)).compareTo(total) != 0)
			throw new PaymentException("EXPENSE_ALLOCATION_MISMATCH");
		return List.copyOf(result);
	}

	/** 은행 원본은 유지하고 검증된 비용 분류와 당시 배분 방식을 확정 기록으로 남깁니다. */
	public static Expense create(UUID property, UUID transaction, UUID account, LocalDate date,
	    String category, String memo, BigDecimal total,
	    String mode, boolean rule, String key, UUID actor, OffsetDateTime at) {
		var e = new Expense();
		e.id = UUID.randomUUID();
		e.propertyId = property;
		e.bankTransactionId = transaction;
		e.sourceType = "BANK_IMPORT";
		e.bankAccountId = account;
		e.expenseDate = date;
		e.categoryEncrypted = category;
		e.memoEncrypted = memo;
		e.totalAmount = total;
		e.allocationMode = mode;
		e.saveAsRule = rule;
		e.ruleKey = key;
		e.confirmedBy = actor;
		e.confirmedAt = at;
		return e;
	}

	/** 은행 원본을 만들지 않고 실제 출금 정보를 보존하며 요청 ID로 중복 등록을 막습니다. */
	public static Expense manual(UUID id, UUID property, UUID account, LocalDate date, String category, String memo,
	    BigDecimal total, String mode, UUID actor, OffsetDateTime at) {
		if (id == null || property == null || account == null || date == null || actor == null || at == null
		    || category == null || category.isBlank() || total == null || total.signum() <= 0
		    || total.scale() > 0 || total.precision() > 15 || !Set.of("EQUAL", "RATIO", "AMOUNT").contains(mode))
			throw new PaymentException("INVALID_MANUAL_EXPENSE");
		var e = create(property, null, account, date, category, memo, total, mode, false, null, actor, at);
		e.id = id;
		e.sourceType = "MANUAL";
		return e;
	}
}
