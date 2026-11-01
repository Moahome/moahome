package com.moahome.server.dashboard.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.banking.dto.BankingBalanceResponse;
import com.moahome.server.banking.dto.BankingResponse;
import com.moahome.server.banking.service.BankingBalanceService;
import com.moahome.server.banking.service.BankingService;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.membership.dto.ResidentInvitations;
import com.moahome.server.membership.dto.SignupRequests;
import com.moahome.server.membership.service.MembershipRequestService;
import com.moahome.server.membership.service.ResidentInvitationService;
import com.moahome.server.payment.dto.PaymentResponse;
import com.moahome.server.payment.service.PaymentService;
import com.moahome.server.property.dto.ManagementPropertyResponse;
import com.moahome.server.property.service.ManagementAccessService;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DashboardServiceTest {
	private final ManagementAccessService access = mock(ManagementAccessService.class);
	private final BankingService banking = mock(BankingService.class);
	private final BankingBalanceService balances = mock(BankingBalanceService.class);
	private final PaymentService payments = mock(PaymentService.class);
	private final MembershipRequestService memberships = mock(MembershipRequestService.class);
	private final ResidentInvitationService invitations = mock(ResidentInvitationService.class);
	private final Clock clock = Clock.fixed(Instant.parse("2026-10-31T15:30:00Z"), ZoneOffset.UTC);
	private final UUID user = UUID.randomUUID(), property = UUID.randomUUID(), account = UUID.randomUUID();
	private final LocalDate today = LocalDate.of(2026, 11, 1);
	private final DashboardService service = new DashboardService(access, banking, balances, payments, memberships,
		invitations, clock);

	private void sources(PropertyMemberRole role) {
		when(access.getManagementContext(user, property))
			.thenReturn(new ManagementPropertyResponse(property, "모아빌라", role));
		when(payments.workspace(user, property)).thenReturn(new PaymentResponse.Ledger(property, today, List.of(),
			List.of(), List.of(), List.of(), List.of()));
		when(banking.workspace(user, property)).thenReturn(new BankingResponse.Workspace(property, today, List.of(),
			List.of(), List.of(), List.of(), List.of()));
		when(balances.workspace(eq(user), eq(property), anyString())).thenAnswer(call ->
			new BankingBalanceResponse.Workspace(property, call.getArgument(2), null, null, null, List.of(), List.of(),
				List.of(), List.of(), List.of()));
		when(memberships.workspace(user, property)).thenReturn(new SignupRequests.Workspace(property, List.of()));
		when(invitations.workspace(user, property)).thenReturn(new ResidentInvitations.Workspace(property, List.of()));
	}

	@Test
	void checksCurrentAccessBeforeReadingFinancialAndMembershipData() {
		when(access.getManagementContext(user, property)).thenThrow(new AuthException(AuthErrorCode.ACCESS_DENIED));
		assertThrows(AuthException.class, () -> service.get(user, property, null));
		verifyNoInteractions(payments, banking, balances, memberships, invitations);
	}

	@ParameterizedTest
	@EnumSource(value = PropertyMemberRole.class, names = {"ADMIN", "MANAGER"})
	void defaultsToKoreanMonthForBothManagersAndReturnsOneLedger(PropertyMemberRole role) {
		sources(role);
		var result = service.get(user, property, null);
		assertEquals("2026-11", result.month());
		assertEquals(today, result.businessDate());
		assertEquals(clock.instant(), result.generatedAt().toInstant());
		assertEquals("모아빌라", result.propertyName());
		assertEquals(property, result.payments().propertyId());
		verify(payments).workspace(user, property);
		verify(balances).workspace(user, property, "2026-11");
	}

	@Test
	void selectedPastMonthDoesNotHideCurrentTasksAndExcludesFutureRows() {
		sources(PropertyMemberRole.ADMIN);
		var old = transaction(LocalDate.of(2026, 10, 10), "INCOME", "PENDING", "100", "BANK_IMPORT");
		var current = transaction(today, "EXPENSE", "PENDING", "200", "BANK_IMPORT");
		var future = transaction(today.plusDays(1), "INCOME", "PENDING", "100", "BANK_IMPORT");
		when(banking.workspace(user, property)).thenReturn(new BankingResponse.Workspace(property, today, List.of(),
			List.of(), List.of(old, current, future), List.of(), List.of()));
		var request = mock(SignupRequests.Item.class);
		when(request.status()).thenReturn("PENDING");
		var approved = mock(SignupRequests.Item.class);
		when(approved.status()).thenReturn("APPROVED");
		when(memberships.workspace(user, property)).thenReturn(new SignupRequests.Workspace(property, List.of(request, approved)));
		var change = mock(ResidentInvitations.Item.class);
		when(change.status()).thenReturn("CHANGE_REQUESTED");
		when(invitations.workspace(user, property)).thenReturn(new ResidentInvitations.Workspace(property, List.of(change)));
		var external = mock(BankingBalanceResponse.External.class);
		when(external.date()).thenReturn(LocalDate.of(2026, 9, 1));
		when(external.remaining()).thenReturn("8000");
		var excluded = mock(BankingBalanceResponse.External.class);
		when(excluded.excluded()).thenReturn(true);
		when(balances.workspace(user, property, "2026-11")).thenReturn(new BankingBalanceResponse.Workspace(property,
			"2026-11", null, null, null, List.of(), List.of(), List.of(external, excluded), List.of(), List.of()));
		var result = service.get(user, property, "2026-10");
		assertEquals(List.of(old), result.banking().rows());
		assertEquals(1, result.tasks().income());
		assertEquals(1, result.tasks().expenses());
		assertEquals(1, result.tasks().joinRequests());
		assertEquals(1, result.tasks().invitationChanges());
		assertEquals(1, result.tasks().external());
	}

	@Test
	void flagsManualDuplicateCandidatesWithoutCancelingOrDoubleCountingLinkedPayments() {
		sources(PropertyMemberRole.ADMIN);
		var bank = transaction(today, "INCOME", "CONFIRMED", "100", "BANK_IMPORT");
		var draft = payment("PENDING", null);
		var linked = payment("CONFIRMED", UUID.randomUUID());
		var canceled = payment("CANCELED", null);
		when(banking.workspace(user, property)).thenReturn(new BankingResponse.Workspace(property, today, List.of(),
			List.of(), List.of(bank), List.of(), List.of()));
		when(payments.workspace(user, property)).thenReturn(new PaymentResponse.Ledger(property, today, List.of(),
			List.of(), List.of(), List.of(draft, linked, canceled), List.of()));
		var result = service.get(user, property, null);
		assertEquals(1, result.tasks().duplicates());
		assertEquals(1, result.tasks().income());
		assertEquals(3, result.payments().payments().size());
		verify(banking).workspace(user, property);
		verifyNoMoreInteractions(banking);
	}

	@Test
	void rejectsInvalidMonthBeforeSourcesAndPropagatesSourceFailure() {
		sources(PropertyMemberRole.ADMIN);
		assertThrows(IllegalArgumentException.class, () -> service.get(user, property, "2026-13"));
		verifyNoInteractions(payments, banking, balances, memberships, invitations);
		when(memberships.workspace(user, property)).thenThrow(new IllegalStateException("unavailable"));
		assertThrows(IllegalStateException.class, () -> service.get(user, property, null));
	}

	private BankingResponse.Transaction transaction(LocalDate date, String direction, String status, String amount,
		String source) {
		return new BankingResponse.Transaction(UUID.randomUUID(), account, date, null, "거래", null, amount, null,
			direction, "", null, status, "", "", null, null, null, false, null, source);
	}

	private PaymentResponse.Payment payment(String status, UUID original) {
		return new PaymentResponse.Payment(UUID.randomUUID(), "MANUAL", status, account, today, "입금자", "100", "",
			"", List.of(), null, original, null, null, null, null, "HOUSEHOLD", null, null);
	}
}
