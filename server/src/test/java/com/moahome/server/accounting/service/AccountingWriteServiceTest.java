package com.moahome.server.accounting.service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import com.moahome.server.accounting.domain.AccountingAccount;
import com.moahome.server.accounting.domain.AccountingProfile;
import com.moahome.server.accounting.domain.ExpenseAccountingReview;
import com.moahome.server.accounting.domain.IncomeGroup;
import com.moahome.server.accounting.dto.AccountingRequests;
import com.moahome.server.accounting.exception.AccountingException;
import com.moahome.server.accounting.repo.AccountingAccountRepository;
import com.moahome.server.accounting.repo.AccountingProfileRepository;
import com.moahome.server.accounting.repo.ExpenseAccountingReviewRepository;
import com.moahome.server.accounting.repo.RevenueAccountingReviewRepository;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.banking.dto.BankingResponse;
import com.moahome.server.banking.service.BankingService;
import com.moahome.server.billing.service.BillingIncomeSourceService;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.domain.Property;
import com.moahome.server.property.dto.ManagementPropertyResponse;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.property.service.ManagementAccessService;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.argThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.clearInvocations;

class AccountingWriteServiceTest {
	private final UUID actor = UUID.randomUUID(), propertyId = UUID.randomUUID(), expenseId = UUID.randomUUID();
	private final ManagementAccessService access = mock(ManagementAccessService.class);
	private final PropertyRepository properties = mock(PropertyRepository.class);
	private final AccountingProfileRepository profiles = mock(AccountingProfileRepository.class);
	private final AccountingAccountRepository accounts = mock(AccountingAccountRepository.class);
	private final ExpenseAccountingReviewRepository reviews = mock(ExpenseAccountingReviewRepository.class);
	private final RevenueAccountingReviewRepository revenues = mock(RevenueAccountingReviewRepository.class);
	private final BillingIncomeSourceService billing = mock(BillingIncomeSourceService.class);
	private final BankingService banking = mock(BankingService.class);
	private final PaymentTextSecurity security = mock(PaymentTextSecurity.class);
	private final Clock clock = Clock.systemUTC();
	private final AccountingTransferService accountingTransfers = mock(AccountingTransferService.class);
	private final AccountingWriteService service = new AccountingWriteService(access, properties, profiles, accounts,
		reviews, revenues, billing, banking, security, clock, accountingTransfers);
	private final AccountingAccount account = AccountingAccount.create(propertyId, "812", "비용", IncomeGroup.OPERATING_EXPENSE,
		null, actor, OffsetDateTime.now(clock));

	@BeforeEach
	void setup() {
		when(billing.firstMonth(propertyId, null)).thenReturn(YearMonth.of(2026, 10));
		when(profiles.existsById(propertyId)).thenReturn(true);
		when(accounts.findByPropertyIdOrderByCreatedAtAscIdAsc(propertyId)).thenReturn(List.of(account));
		when(access.getManagementContext(actor, propertyId)).thenReturn(
			new ManagementPropertyResponse(propertyId, "관리대상", PropertyMemberRole.ADMIN));
		when(properties.findForUnitUpdate(propertyId)).thenReturn(Optional.of(mock(Property.class)));
		when(properties.findById(propertyId)).thenReturn(Optional.of(mock(Property.class)));
		when(profiles.findById(propertyId)).thenReturn(Optional.of(AccountingProfile.create(propertyId,
			YearMonth.of(2026, 10), 1, actor, OffsetDateTime.now(clock))));
		when(accounts.findById(account.getId())).thenReturn(Optional.of(account));
		var row = mock(BankingResponse.Transaction.class);
		when(row.direction()).thenReturn("EXPENSE");
		when(row.status()).thenReturn("CONFIRMED");
		when(row.date()).thenReturn(LocalDate.of(2026, 9, 15));
		when(row.expense()).thenReturn(new BankingResponse.Expense(expenseId, "비용", null, "PROPERTY", false, List.of()));
		when(banking.workspace(actor, propertyId)).thenReturn(new BankingResponse.Workspace(propertyId,
			null, List.of(), List.of(), List.of(row), List.of()));
		when(security.protect("확인 사유")).thenReturn(new PaymentTextSecurity.ProtectedText("encrypted", "hash"));
		when(security.protect("계정과목 매칭")).thenReturn(new PaymentTextSecurity.ProtectedText("matched", "hash"));
	}

	@Test
	void managersCannotConfigureOrWriteAndRoleRevokedDuringLockIsRechecked() {
		when(access.getManagementContext(actor, propertyId)).thenReturn(
			new ManagementPropertyResponse(propertyId, "관리대상", PropertyMemberRole.MANAGER));
		assertThatThrownBy(() -> service.configure(actor, propertyId, new AccountingRequests.Configure("2026-10", 1)))
			.isInstanceOf(AuthException.class);
		verifyNoInteractions(profiles);
		when(access.getManagementContext(actor, propertyId)).thenReturn(
			new ManagementPropertyResponse(propertyId, "관리대상", PropertyMemberRole.ADMIN),
			new ManagementPropertyResponse(propertyId, "관리대상", PropertyMemberRole.MANAGER));
		assertThatThrownBy(() -> service.configure(actor, propertyId, new AccountingRequests.Configure("2026-10", 1)))
			.isInstanceOf(AuthException.class);
		verifyNoInteractions(profiles);
	}

	@Test
	void appendsReviewAndRejectsLostUpdatesButIdenticalRetryDoesNotDuplicate() {
		var request = new AccountingRequests.ReviewExpense(account.getId(), "2026-09", 0, "확인 사유");
		service.reviewExpense(actor, propertyId, expenseId, request);
		verify(reviews).saveAndFlush(argThat(review -> review.getRevision() == 1
			&& review.getRecognitionMonth().equals(YearMonth.of(2026, 9).atDay(1))));
		var previous = ExpenseAccountingReview.create(propertyId, expenseId, account, YearMonth.of(2026, 9),
			1, "encrypted", actor, OffsetDateTime.now(clock));
		when(reviews.findFirstByPropertyIdAndExpenseIdOrderByRevisionDesc(propertyId, expenseId))
			.thenReturn(Optional.of(previous));
		when(security.decrypt("encrypted")).thenReturn("확인 사유");
		clearInvocations(reviews);
		service.reviewExpense(actor, propertyId, expenseId, request);
		verify(reviews, never()).saveAndFlush(any());
		assertThatThrownBy(() -> service.reviewExpense(actor, propertyId, expenseId,
			new AccountingRequests.ReviewExpense(account.getId(), "2026-10", 0, "다른 사유")))
			.isInstanceOf(AccountingException.class).hasMessage("ACCOUNTING_REVIEW_CONFLICT");
	}

	@Test
	void matchesWithoutUserDateOrReasonAndUsesOriginalExpenseDate() {
		service.reviewExpense(actor, propertyId, expenseId,
			new AccountingRequests.ReviewExpense(account.getId(), null, 0, null));
		verify(reviews).saveAndFlush(argThat(review -> review.getRecognitionMonth().equals(LocalDate.of(2026, 9, 1))
			&& review.getReasonEncrypted().equals("matched")));
	}

	@Test
	void refusesMissingSourcesAndCrossPropertyAccounts() {
		when(banking.workspace(actor, propertyId)).thenReturn(new BankingResponse.Workspace(propertyId,
			null, List.of(), List.of(), List.of(), List.of()));
		assertThatThrownBy(() -> service.reviewExpense(actor, propertyId, expenseId,
			new AccountingRequests.ReviewExpense(account.getId(), "2026-10", 0, "확인 사유")))
			.hasMessage("ACCOUNTING_SOURCE_NOT_FOUND");
		var foreign = AccountingAccount.create(UUID.randomUUID(), "812", "비용", IncomeGroup.OPERATING_EXPENSE, null,
			actor, OffsetDateTime.now(clock));
		when(accounts.findById(foreign.getId())).thenReturn(Optional.of(foreign));
		assertThatThrownBy(() -> service.reviewExpense(actor, propertyId, expenseId,
			new AccountingRequests.ReviewExpense(foreign.getId(), "2026-10", 0, "확인 사유")))
			.hasMessage("INVALID_ACCOUNTING_ACCOUNT");
	}
}
