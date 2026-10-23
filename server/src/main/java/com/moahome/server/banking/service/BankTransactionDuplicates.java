package com.moahome.server.banking.service;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import com.moahome.server.banking.domain.BankTransaction;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.payment.exception.PaymentException;

/** 같은 통장의 활성 원본을 한 번 색인해 새 키·과거 키의 교차 재업로드를 함께 확인합니다. */
public final class BankTransactionDuplicates {
	private record Bucket(LocalDate date, String direction, BigDecimal amount) {
	}

	private final Map<String, BankTransaction> keys = new HashMap<>();
	private final Map<Bucket, List<BankTransaction>> candidates = new HashMap<>();
	private final PaymentTextSecurity security;

	public BankTransactionDuplicates(List<BankTransaction> originals, UUID accountId, PaymentTextSecurity security) {
		this.security = security;
		originals.stream().filter(row -> row.getDeletedAt() == null && accountId.equals(row.getBankAccountId()))
		    .forEach(this::remember);
	}

	public void remember(BankTransaction row) {
		keys.put(row.getDeduplicationKey(), row);
		Bucket bucket = new Bucket(row.getTransactionDate(), row.getDirection(), row.getAmount().stripTrailingZeros());
		candidates.computeIfAbsent(bucket, ignored -> new ArrayList<>()).add(row);
	}

	/** 부족한 과거 정보는 중복 또는 신규로 추정하지 않고 명시적인 확인 오류로 돌려 원장 변경을 막습니다. */
	public Optional<BankTransaction> find(BankTransactionReader.Row row) {
		BankTransaction exact = keys.get(BankTransactionKeys.key(row, security));
		if (exact != null)
			return Optional.of(exact);
		String legacy = BankTransactionKeys.legacyKey(row, security);
		String payerHash = security.nameHash(row.payer());
		Bucket bucket = new Bucket(row.date(), row.direction(), row.amount().stripTrailingZeros());
		for (BankTransaction original : candidates.getOrDefault(bucket, List.of())) {
			boolean samePayer = payerHash.equals(original.getPayerNameHmac());
			if (!samePayer) {
				// 신한의 과거 열 매핑 등으로 이름이 달라도 같은 일시·잔액이면 재수납하지 않습니다.
				if (row.time() != null && row.balance() != null && row.time().equals(original.getTransactionTime())
				    && original.getBalance() != null && row.balance().compareTo(original.getBalance()) == 0)
					throw new PaymentException("BANK_DUPLICATE_REVIEW_REQUIRED");
				continue;
			}
			if (row.reference() != null && original.getBankReference() != null) {
				if (row.reference().equals(original.getBankReference()))
					return Optional.of(original);
				continue;
			}
			if (different(row.time(), original.getTransactionTime()) || different(row.balance(), original.getBalance()))
				continue;
			boolean complete = Objects.equals(row.time(), original.getTransactionTime())
			    && sameAmount(row.balance(), original.getBalance());
			if (complete && (row.time() != null || row.balance() != null
			    || legacy.equals(original.getDeduplicationKey())))
				return Optional.of(original);
			throw new PaymentException("BANK_DUPLICATE_REVIEW_REQUIRED");
		}
		return Optional.empty();
	}

	private boolean different(LocalTime left, LocalTime right) {
		return left != null && right != null && !left.equals(right);
	}

	private boolean different(BigDecimal left, BigDecimal right) {
		return left != null && right != null && left.compareTo(right) != 0;
	}

	private boolean sameAmount(BigDecimal left, BigDecimal right) {
		return left == null ? right == null : right != null && left.compareTo(right) == 0;
	}
}
