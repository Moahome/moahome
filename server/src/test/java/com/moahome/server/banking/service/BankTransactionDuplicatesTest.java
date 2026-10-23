package com.moahome.server.banking.service;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import com.moahome.server.banking.domain.BankTransaction;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.payment.exception.PaymentException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class BankTransactionDuplicatesTest {
	private final UUID property = UUID.randomUUID(), account = UUID.randomUUID(), actor = UUID.randomUUID();
	private final PaymentTextSecurity security = mock(PaymentTextSecurity.class);

	@BeforeEach
	void setup() {
		when(security.nameHash(anyString())).thenAnswer(call -> "hash:" + call.getArgument(0));
	}

	private BankTransactionReader.Row row(String time, String balance) {
		return new BankTransactionReader.Row(LocalDate.of(2026, 10, 15), "검증상대", new BigDecimal("50000"), null,
		    null, time == null ? null : LocalTime.parse(time), balance == null ? null : new BigDecimal(balance));
	}

	private BankTransaction original(BankTransactionReader.Row row, boolean legacy) {
		return BankTransaction.create(property, account, row.date(), row.amount(), "encrypted",
		    security.nameHash(row.payer()), row.memo(), row.reference(), legacy
		        ? BankTransactionKeys.legacyKey(row, security) : BankTransactionKeys.key(row, security), actor,
		    OffsetDateTime.now(), row.time(), row.balance());
	}

	/** 기존 키·연결을 바꾸지 않고 재업로드는 제외하며 같은 날의 별도 입금은 보존합니다. */
	@Test
	void recognizesLegacyAndNewKeysWithoutDroppingSeparateDeposits() {
		var first = row("09:00:00", "100000");
		var second = row("10:00:00", "150000");
		var saved = original(first, true);
		var duplicates = new BankTransactionDuplicates(List.of(saved), account, security);
		assertThat(duplicates.find(first)).contains(saved);
		assertThat(duplicates.find(second)).isEmpty();
		assertThat(BankTransactionKeys.key(first, security)).isNotEqualTo(BankTransactionKeys.key(second, security));
		var next = original(second, false);
		duplicates.remember(next);
		assertThat(duplicates.find(second)).contains(next);
		assertThat(saved.getDeduplicationKey()).isEqualTo(BankTransactionKeys.legacyKey(first, security));
	}

	@Test
	void missingInformationRequiresReviewInsteadOfGuessing() {
		var saved = original(row(null, null), true);
		assertThatThrownBy(() -> new BankTransactionDuplicates(List.of(saved), account, security)
		    .find(row("09:00:00", "100000"))).isInstanceOf(PaymentException.class)
		    .hasMessage("BANK_DUPLICATE_REVIEW_REQUIRED");
	}

	@Test
	void changedCounterpartyAtSameInstantAndBalanceRequiresReview() {
		var source = row("09:00:00", "100000");
		var saved = BankTransaction.create(property, account, source.date(), source.amount(), "encrypted",
		    "hash:과거 거래종류", null, null, "legacy-wrong-mapping", actor, OffsetDateTime.now(), source.time(), source.balance());
		assertThatThrownBy(() -> new BankTransactionDuplicates(List.of(saved), account, security).find(source))
		    .isInstanceOf(PaymentException.class).hasMessage("BANK_DUPLICATE_REVIEW_REQUIRED");
	}

	@Test
	void deletedAndOtherAccountSourcesDoNotBlockImport() {
		var source = row("09:00:00", "100000");
		var saved = original(source, true);
		assertThat(new BankTransactionDuplicates(List.of(saved), UUID.randomUUID(), security).find(source)).isEmpty();
		saved.softDelete(actor, OffsetDateTime.now());
		assertThat(new BankTransactionDuplicates(List.of(saved), account, security).find(source)).isEmpty();
	}
}
