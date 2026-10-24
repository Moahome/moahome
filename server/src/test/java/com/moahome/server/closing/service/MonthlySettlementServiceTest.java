package com.moahome.server.closing.service;

import java.time.*;
import java.util.*;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.banking.dto.BankingBalanceResponse;
import com.moahome.server.banking.dto.BankingResponse;
import com.moahome.server.banking.service.BankingBalanceService;
import com.moahome.server.banking.service.BankingService;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.payment.dto.PaymentResponse;
import com.moahome.server.payment.service.PaymentService;
import com.moahome.server.property.dto.ManagementPropertyResponse;
import com.moahome.server.property.service.ManagementAccessService;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MonthlySettlementServiceTest {
	private final ManagementAccessService access = mock(ManagementAccessService.class);

	private final BankingService banking = mock(BankingService.class);

	private final BankingBalanceService balances = mock(BankingBalanceService.class);

	private final PaymentService payments = mock(PaymentService.class);

	private final Clock clock = Clock.fixed(Instant.parse("2026-10-31T15:30:00Z"), ZoneOffset.UTC);

	private final MonthlySettlementService service = new MonthlySettlementService(access, banking, balances, payments,
	    clock);

	private final UUID user = UUID.randomUUID(), property = UUID.randomUUID();

	@Test
	void deniesNonManagerBeforeReadingAnyFinancialData() {
		when(access.getManagementContext(user, property))
		    .thenThrow(new AuthException(com.moahome.server.auth.exception.AuthErrorCode.ACCESS_DENIED));
		assertThrows(AuthException.class, () -> service.get(user, property, "2026-10"));
		verifyNoInteractions(banking, balances, payments);
	}

	@org.junit.jupiter.params.ParameterizedTest
	@org.junit.jupiter.params.provider.EnumSource(value = PropertyMemberRole.class, names = {"ADMIN", "MANAGER"})
	void defaultsToKoreanMonthAndKeepsTheExistingLedgerAndBalanceResults(PropertyMemberRole role) {
		var ledger = new PaymentResponse.Ledger(property, LocalDate.of(2026, 11, 1), List.of(), List.of(), List.of(),
		    List.of(), List.of());
		var cash = new BankingBalanceResponse.Workspace(property, "2026-11", null, null, null, List.of(), List.of(),
		    List.of(), List.of(), List.of());
		when(access.getManagementContext(user, property))
		    .thenReturn(new ManagementPropertyResponse(property, "모아빌라", role));
		when(payments.workspace(user, property)).thenReturn(ledger);
		when(balances.workspace(user, property, "2026-11")).thenReturn(cash);
		var old = mock(BankingResponse.Transaction.class);
		var current = mock(BankingResponse.Transaction.class);
		when(old.date()).thenReturn(LocalDate.of(2026, 10, 31));
		when(current.date()).thenReturn(LocalDate.of(2026, 11, 1));
		when(banking.workspace(user, property)).thenReturn(new BankingResponse.Workspace(property,
		    LocalDate.of(2026, 11, 1), List.of(), List.of(), List.of(old, current), List.of()));
		var result = service.get(user, property, null);
		assertEquals("2026-11", result.month());
		assertEquals(property, result.propertyId());
		assertSame(ledger, result.payments());
		assertSame(cash, result.balances());
		assertEquals(List.of(current), result.banking().rows());
		assertEquals(clock.instant(), result.generatedAt().toInstant());
	}

	@Test
	void rejectsInvalidMonthAndDoesNotReturnPartialResultsOnSourceFailure() {
		when(access.getManagementContext(user, property))
		    .thenReturn(new ManagementPropertyResponse(property, "모아빌라", PropertyMemberRole.ADMIN));
		assertThrows(IllegalArgumentException.class, () -> service.get(user, property, "2026-13"));
		verifyNoInteractions(banking, balances, payments);
		when(payments.workspace(user, property)).thenThrow(new IllegalStateException("unavailable"));
		assertThrows(IllegalStateException.class, () -> service.get(user, property, "2026-10"));
		verifyNoInteractions(banking, balances);
	}
}
