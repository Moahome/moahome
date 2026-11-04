package com.moahome.server.accounting.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import com.moahome.server.accounting.domain.AccountingAccount;
import com.moahome.server.accounting.domain.AccountingProfile;
import com.moahome.server.accounting.domain.ExpenseAccountingReview;
import com.moahome.server.accounting.domain.IncomeGroup;
import com.moahome.server.accounting.domain.RevenueAccountingReview;
import com.moahome.server.accounting.repo.AccountingAccountRepository;
import com.moahome.server.accounting.repo.AccountingProfileRepository;
import com.moahome.server.accounting.repo.ExpenseAccountingReviewRepository;
import com.moahome.server.accounting.repo.RevenueAccountingReviewRepository;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.banking.dto.BankingResponse;
import com.moahome.server.banking.service.BankingService;
import com.moahome.server.billing.domain.FeeItemCode;
import com.moahome.server.billing.dto.BillingIncomeSource;
import com.moahome.server.billing.service.BillingIncomeSourceService;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.domain.Property;
import com.moahome.server.property.dto.ManagementPropertyResponse;
import com.moahome.server.property.repo.BuildingRepository;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.property.service.ManagementAccessService;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verifyNoInteractions;

class IncomeStatementServiceTest {
	private final UUID actor = UUID.randomUUID(), propertyId = UUID.randomUUID(), itemId = UUID.randomUUID();
	private final Clock clock = Clock.fixed(Instant.parse("2026-10-31T15:10:00Z"), ZoneOffset.UTC);
	private final OffsetDateTime at = OffsetDateTime.now(clock);
	private final ManagementAccessService access = mock(ManagementAccessService.class);
	private final PropertyRepository properties = mock(PropertyRepository.class);
	private final BuildingRepository buildings = mock(BuildingRepository.class);
	private final AccountingProfileRepository profiles = mock(AccountingProfileRepository.class);
	private final AccountingAccountRepository accounts = mock(AccountingAccountRepository.class);
	private final ExpenseAccountingReviewRepository reviews = mock(ExpenseAccountingReviewRepository.class);
	private final RevenueAccountingReviewRepository revenues = mock(RevenueAccountingReviewRepository.class);
	private final BillingIncomeSourceService billing = mock(BillingIncomeSourceService.class);
	private final BankingService banking = mock(BankingService.class);
	private final IncomeStatementService service = new IncomeStatementService(access, properties, buildings, profiles,
		accounts, reviews, revenues, billing, banking, clock);
	private final AccountingAccount revenue = AccountingAccount.create(propertyId, "관리비수익",
		IncomeGroup.OPERATING_REVENUE, "MANAGEMENT_REVENUE", actor, at);
	private final AccountingAccount cost = AccountingAccount.create(propertyId, "청소비",
		IncomeGroup.OPERATING_EXPENSE, null, actor, at);

	@BeforeEach
	void setup() {
		when(access.getManagementContext(actor, propertyId))
			.thenReturn(new ManagementPropertyResponse(propertyId, "테스트 관리대상", PropertyMemberRole.ADMIN));
		Property property = mock(Property.class);
		when(property.getId()).thenReturn(propertyId);
		when(properties.findById(propertyId)).thenReturn(Optional.of(property));
		when(accounts.findByPropertyIdOrderByCreatedAtAscIdAsc(propertyId)).thenReturn(List.of(revenue, cost));
		when(profiles.findById(propertyId)).thenReturn(Optional.of(AccountingProfile.create(propertyId,
			YearMonth.of(2026, 10), 1, actor, at)));
		when(banking.workspace(actor, propertyId)).thenReturn(new BankingResponse.Workspace(propertyId,
			LocalDate.of(2026, 11, 1), List.of(), List.of(), List.of(), List.of()));
	}

	@Test
	void rejectsOutsidersBeforeAccessingSourcesAndDoesNotWriteOnGet() {
		when(access.getManagementContext(actor, propertyId)).thenThrow(new AuthException(AuthErrorCode.ACCESS_DENIED));
		assertThatThrownBy(() -> service.get(actor, propertyId, null, null, null)).isInstanceOf(AuthException.class);
		verifyNoInteractions(properties, billing, banking, profiles);
	}

	@Test
	void requiresExplicitSetupAndUsesKoreanDefaultMonth() {
		when(profiles.findById(propertyId)).thenReturn(Optional.empty());
		var result = service.get(actor, propertyId, null, null, null);
		assertThat(result.completeness()).isEqualTo("SETUP_REQUIRED");
		assertThat(result.range().startMonth()).isEqualTo("2026-11");
		assertThat(result.records()).isEmpty();
		verifyNoInteractions(billing, banking);
		verify(profiles, never()).save(any());
	}

	@Test
	void onlyRecognizesExplicitlyConfirmedRevenueAndLeavesNegativeAndUnknownItemsVisible() {
		var confirmed = new BillingIncomeSource.Item(UUID.randomUUID(), itemId, "사용자 지정 이름", null,
			new BigDecimal("200"));
		var unconfirmed = new BillingIncomeSource.Item(UUID.randomUUID(), UUID.randomUUID(), "기본 관리비",
			FeeItemCode.GENERAL_MANAGEMENT, new BigDecimal("50"));
		when(billing.get(propertyId)).thenReturn(List.of(
			new BillingIncomeSource(UUID.randomUUID(), UUID.randomUUID(), "2026-10", "", new BigDecimal("250"),
				List.of(confirmed, unconfirmed)),
			new BillingIncomeSource(UUID.randomUUID(), UUID.randomUUID(), "2026-10", "", new BigDecimal("-10"), List.of())));
		when(revenues.findByPropertyIdOrderByRevisionDesc(propertyId)).thenReturn(List.of(
			RevenueAccountingReview.create(propertyId, itemId, true, 1, "encrypted", actor, at)));
		var result = service.get(actor, propertyId, "2026-10", "2026-10", null);
		assertThat(result.records()).hasSize(1);
		assertThat(result.records().getFirst().amount()).isEqualTo("200");
		assertThat(result.issues()).extracting(issue -> issue.code()).containsExactlyInAnyOrder(
			"CHARGE_POLICY_REVIEW_REQUIRED", "REVENUE_CLASSIFICATION_REQUIRED");
		assertThat(result.completeness()).isEqualTo("REVIEW_REQUIRED");
	}

	@Test
	void usesExpenseRecognitionMonthAndKeepsUnreviewedHistoricExpensesPending() {
		UUID expenseId = UUID.randomUUID();
		var row = expense(expenseId);
		when(banking.workspace(actor, propertyId)).thenReturn(new BankingResponse.Workspace(propertyId,
			LocalDate.of(2026, 11, 1), List.of(), List.of(), List.of(row), List.of()));
		var pending = service.get(actor, propertyId, "2026-10", "2026-10", null);
		assertThat(pending.issues()).hasSize(1);
		assertThat(pending.records()).isEmpty();
		when(reviews.findByPropertyIdOrderByRevisionDesc(propertyId)).thenReturn(List.of(
			ExpenseAccountingReview.create(propertyId, expenseId, cost, YearMonth.of(2026, 10), 1, "encrypted", actor, at)));
		var result = service.get(actor, propertyId, "2026-10", "2026-10", null);
		assertThat(result.records()).hasSize(1);
		assertThat(result.records().getFirst().month()).isEqualTo("2026-10");
		assertThat(result.records().getFirst().amount()).isEqualTo("100");
		assertThat(result.completeness()).isEqualTo("READY");
		when(reviews.findByPropertyIdOrderByRevisionDesc(propertyId)).thenReturn(List.of(
			ExpenseAccountingReview.create(propertyId, expenseId, cost, YearMonth.of(2026, 9), 2, "encrypted", actor, at)));
		assertThat(service.get(actor, propertyId, "2026-10", "2026-10", null).records()).isEmpty();
	}

	@Test
	void doesNotTurnSourceFailureOrPreStartPeriodIntoZeroProfit() {
		assertThat(service.get(actor, propertyId, "2026-09", "2026-10", null).completeness()).isEqualTo("BEFORE_START");
		verifyNoInteractions(billing, banking);
		when(billing.get(propertyId)).thenThrow(new IllegalStateException("source unavailable"));
		assertThatThrownBy(() -> service.get(actor, propertyId, "2026-10", "2026-10", null))
			.isInstanceOf(IllegalStateException.class);
	}

	private BankingResponse.Transaction expense(UUID id) {
		var row = mock(BankingResponse.Transaction.class);
		when(row.id()).thenReturn(id);
		when(row.date()).thenReturn(LocalDate.of(2026, 9, 15));
		when(row.direction()).thenReturn("EXPENSE");
		when(row.status()).thenReturn("CONFIRMED");
		when(row.amount()).thenReturn("100");
		when(row.expense()).thenReturn(new BankingResponse.Expense(id, "청소비", null, "PROPERTY", false, List.of()));
		return row;
	}
}
