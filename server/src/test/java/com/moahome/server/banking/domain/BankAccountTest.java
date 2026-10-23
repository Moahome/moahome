package com.moahome.server.banking.domain;

import java.time.*;
import java.util.UUID;
import com.moahome.server.common.security.AccountNumberSecurity;
import com.moahome.server.property.domain.Property;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class BankAccountTest {
	@Test
	void visibilityUsesActualHistoryAndIncludesClosingMonthOnly() {
		var property = mock(Property.class);
		when(property.getId()).thenReturn(UUID.randomUUID());
		var account = BankAccount.createPublic(property, "004", "국민은행", "관리단",
		    new AccountNumberSecurity.ProtectedAccountNumber("protected", "hmac", "3513"), false,
		    OffsetDateTime.parse("2026-10-15T00:00:00Z"));
		assertThat(account.visibleIn(YearMonth.of(2026, 9), null)).isFalse();
		assertThat(account.visibleIn(YearMonth.of(2026, 10), null)).isTrue();
		account.close(LocalDate.of(2026, 10, 23));
		assertThat(account.visibleIn(YearMonth.of(2026, 10), null)).isFalse();
		var firstUse = LocalDate.of(2026, 8, 15);
		assertThat(account.visibleIn(YearMonth.of(2026, 7), firstUse)).isFalse();
		assertThat(account.visibleIn(YearMonth.of(2026, 8), firstUse)).isTrue();
		assertThat(account.visibleIn(YearMonth.of(2026, 10), firstUse)).isTrue();
		assertThat(account.visibleIn(YearMonth.of(2026, 11), firstUse)).isFalse();
	}
}
