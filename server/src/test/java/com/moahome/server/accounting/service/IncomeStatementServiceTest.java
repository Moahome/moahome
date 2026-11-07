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
import com.moahome.server.accounting.domain.DefaultAccount;
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
import com.moahome.server.payment.service.PaymentService;
import com.moahome.server.banking.service.BankingBalanceService;
import com.moahome.server.banking.dto.BankingBalanceResponse;
import com.moahome.server.billing.domain.FeeItemCode;
import com.moahome.server.billing.dto.BillingIncomeSource;
import com.moahome.server.billing.service.BillingIncomeSourceService;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.domain.Property;
import com.moahome.server.property.domain.Building;
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
	private final BankingBalanceService balances = mock(BankingBalanceService.class);
	private final PaymentService payments = mock(PaymentService.class);
	private final AccountingTransferService accountingTransfers = mock(AccountingTransferService.class);
	private final IncomeStatementService service = new IncomeStatementService(access, properties, buildings, profiles,
		accounts, reviews, revenues, billing, banking, balances, clock, accountingTransfers, payments);
	private final AccountingAccount revenue = AccountingAccount.create(propertyId, "401", "관리비수입",
		IncomeGroup.OPERATING_REVENUE, "MANAGEMENT_REVENUE", actor, at);
	private final AccountingAccount cost = AccountingAccount.create(propertyId, "802", "청소비",
		IncomeGroup.OPERATING_EXPENSE, null, actor, at);

	@BeforeEach
	void setup() {
		when(billing.firstMonth(propertyId, null)).thenReturn(YearMonth.of(2026, 10));
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
		when(balances.workspace(actor, propertyId, "2026-10", null)).thenReturn(new BankingBalanceResponse.Workspace(
			propertyId, "2026-10", null, "0", null, List.of(), List.of(), List.of(), List.of(), List.of()));
	}

	@Test
	void rejectsOutsidersBeforeAccessingSourcesAndDoesNotWriteOnGet() {
		when(access.getManagementContext(actor, propertyId)).thenThrow(new AuthException(AuthErrorCode.ACCESS_DENIED));
		assertThatThrownBy(() -> service.get(actor, propertyId, null, null, null)).isInstanceOf(AuthException.class);
		verifyNoInteractions(properties, billing, banking, profiles);
	}

	/** 첫 부과월과 기본 계정은 조회에서 자동 연결하되 설정·원장에 쓰지 않습니다. */
	@Test
	void derivesStartFromFirstBillingWithoutManualSetupOrWritingOnGet() {
		when(profiles.findById(propertyId)).thenReturn(Optional.empty());
		var result = service.get(actor, propertyId, null, null, null);
		assertThat(result.completeness()).isEqualTo("READY");
		assertThat(result.configuration().startMonth()).isEqualTo("2026-10");
		assertThat(result.range().startMonth()).isEqualTo("2026-11");
		assertThat(result.accounts()).extracting(value -> value.code()).contains("102", "103", "201", "401");
		verify(profiles, never()).save(any());
		verify(accounts, never()).saveAllAndFlush(any());
	}

	@Test
	void returnsNoBillingWithoutAskingForAnAccountingStartDate() {
		when(billing.firstMonth(propertyId, null)).thenReturn(null);
		var result = service.get(actor, propertyId, null, null, null);
		assertThat(result.completeness()).isEqualTo("NO_BILLING");
		assertThat(result.configuration()).isNull();
		assertThat(result.records()).isEmpty();
	}

	/** 감액이 포함된 확정 부과 20건을 모두 반영하고 이미 저장된 늦은 시작일이 과거 부과를 숨기지 않습니다. */
	@Test
	void recognizesTwentyAdjustedBillsFromFirstBillingEvenWhenLegacyStartWasLater() {
		when(profiles.findById(propertyId)).thenReturn(Optional.of(AccountingProfile.create(propertyId,
			YearMonth.of(2026, 11), 1, actor, at)));
		UUID discount = UUID.randomUUID();
		when(billing.get(propertyId)).thenReturn(java.util.stream.IntStream.range(0, 20)
			.mapToObj(index -> new BillingIncomeSource(UUID.randomUUID(), UUID.randomUUID(), "2026-10", "", "" + index,
				null, new BigDecimal("50000"), List.of(
					new BillingIncomeSource.Item(UUID.randomUUID(), itemId, "일반관리비", FeeItemCode.GENERAL_MANAGEMENT, new BigDecimal("70000"), null),
					new BillingIncomeSource.Item(UUID.randomUUID(), discount, "일반관리비 감액", FeeItemCode.GENERAL_MANAGEMENT, new BigDecimal("-20000"), null))))
			.toList());
		var result = service.get(actor, propertyId, "2026-10", "2026-10", null);
		assertThat(result.configuration().startMonth()).isEqualTo("2026-10");
		assertThat(result.records().stream().map(row -> new BigDecimal(row.amount())).reduce(BigDecimal.ZERO, BigDecimal::add))
			.isEqualByComparingTo("1000000");
		assertThat(result.issues()).isEmpty();
		assertThat(result.completeness()).isEqualTo("READY");
		verify(profiles, never()).save(any());
	}

	@Test
	void onlyRecognizesExplicitlyConfirmedRevenueAndLeavesNegativeAndUnknownItemsVisible() {
		var confirmed = new BillingIncomeSource.Item(UUID.randomUUID(), itemId, "사용자 지정 이름", null,
			new BigDecimal("200"), null);
		var unconfirmed = new BillingIncomeSource.Item(UUID.randomUUID(), UUID.randomUUID(), "기본 관리비",
			null, new BigDecimal("50"), null);
		when(billing.get(propertyId)).thenReturn(List.of(
			new BillingIncomeSource(UUID.randomUUID(), UUID.randomUUID(), "2026-10", "", "101", null, new BigDecimal("250"),
				List.of(confirmed, unconfirmed)),
			new BillingIncomeSource(UUID.randomUUID(), UUID.randomUUID(), "2026-10", "", "102", null, new BigDecimal("-10"), List.of())));
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
	void distinguishesDeletedBuildingsWithTheSameNameWithoutMergingTheirIds() {
		Building current = mock(Building.class), deleted = mock(Building.class);
		UUID currentId = UUID.randomUUID(), deletedId = UUID.randomUUID();
		when(current.getId()).thenReturn(currentId);
		when(current.getName()).thenReturn("102동");
		when(deleted.getId()).thenReturn(deletedId);
		when(deleted.getName()).thenReturn("102동");
		when(deleted.getDeletedAt()).thenReturn(at);
		when(buildings.findByPropertyId(propertyId)).thenReturn(List.of(current, deleted));
		var result = service.get(actor, propertyId, "2026-10", "2026-10", currentId);
		assertThat(result.buildings()).extracting(value -> value.id()).containsExactly(currentId, deletedId);
		assertThat(result.buildings()).extracting(value -> value.deleted()).containsExactly(false, true);
	}

	@Test
	void identifiesUnattributedChargesByTheirOriginalMonthAndUnitSnapshots() {
		Property property = properties.findById(propertyId).orElseThrow();
		when(property.isHasBuildings()).thenReturn(true);
		UUID firstUnit = UUID.randomUUID(), secondUnit = UUID.randomUUID();
		when(billing.get(propertyId)).thenReturn(List.of(
			new BillingIncomeSource(UUID.randomUUID(), firstUnit, "2026-10", "", "101", "상가",
				new BigDecimal("50000"), List.of()),
			new BillingIncomeSource(UUID.randomUUID(), secondUnit, "2026-10", "", "102", null,
				new BigDecimal("50000"), List.of())));
		var result = service.get(actor, propertyId, "2026-10", "2026-10", null);
		assertThat(result.issues()).hasSize(2);
		assertThat(result.issues()).extracting(issue -> issue.sourceName()).containsOnly("관리비 부과");
		assertThat(result.issues()).extracting(issue -> issue.sourceContext()).containsExactly(
			"2026-10 부과 · 동 정보 없음 · 101호 · 상가", "2026-10 부과 · 동 정보 없음 · 102호");
		assertThat(result.issues().getFirst().path()).contains(firstUnit.toString());
		assertThat(result.records()).isEmpty();
	}

	@Test
	void recognizesExternalReceivablesAndRecoveriesWithoutAddingRevenueOrExpense() {
		Property property = properties.findById(propertyId).orElseThrow();
		when(property.isHasBuildings()).thenReturn(true);
		var first = expense(UUID.randomUUID());
		var second = expense(UUID.randomUUID());
		UUID firstId = first.id(), secondId = second.id();
		when(first.expense()).thenReturn(new BankingResponse.Expense(firstId, "9월 공동 청소", null,
			"AMOUNT", false, List.of(new BankingResponse.Allocation(null, "외부 관리단", "100", null))));
		when(second.date()).thenReturn(LocalDate.of(2026, 10, 15));
		when(second.expense()).thenReturn(new BankingResponse.Expense(secondId, "10월 정화조 청소", null,
			"AMOUNT", false, List.of(new BankingResponse.Allocation(null, "옆 건물", "100", null))));
		when(banking.workspace(actor, propertyId)).thenReturn(new BankingResponse.Workspace(propertyId,
			LocalDate.of(2026, 11, 1), List.of(), List.of(), List.of(first, second), List.of()));
		UUID receiptId = UUID.randomUUID();
		AccountingAccount receivable = AccountingAccount.create(propertyId, "102", "미수금", IncomeGroup.ASSET,
			"RECEIVABLE", actor, at);
		when(accounts.findByPropertyIdOrderByCreatedAtAscIdAsc(propertyId)).thenReturn(List.of(revenue, cost, receivable));
		var receipt = mock(BankingResponse.Transaction.class);
		when(receipt.id()).thenReturn(receiptId);
		when(receipt.paymentId()).thenReturn(receiptId);
		when(receipt.date()).thenReturn(LocalDate.of(2026, 10, 20));
		when(receipt.direction()).thenReturn("INCOME");
		when(receipt.status()).thenReturn("CONFIRMED");
		when(receipt.receiptType()).thenReturn("OTHER");
		when(receipt.amount()).thenReturn("40");
		List<BankingBalanceResponse.External> external = List.of(
			new BankingBalanceResponse.External(firstId, "외부 관리단", "9월 공동 청소", first.date(), "100", "40", "60",
				List.of(new BankingBalanceResponse.Recovery(UUID.randomUUID(), receiptId, receipt.date(), "회수 입금", "40")),
				false, 0, null, firstId, "100"),
			new BankingBalanceResponse.External(secondId, "옆 건물", "10월 정화조 청소", second.date(), "100", "0", "100",
				List.of(), false, 0, null, secondId, "100"));
		when(balances.workspace(actor, propertyId, "2026-10", null)).thenReturn(new BankingBalanceResponse.Workspace(
			propertyId, "2026-10", null, "0", null, List.of(), List.of(), external, List.of(), List.of()));
		when(banking.workspace(actor, propertyId)).thenReturn(new BankingResponse.Workspace(propertyId,
			LocalDate.of(2026, 11, 1), List.of(), List.of(), List.of(first, second, receipt), List.of()));
		var result = service.get(actor, propertyId, "2026-10", "2026-10", null);
		assertThat(result.issues()).isEmpty();
		assertThat(result.receivables()).extracting(value -> value.accountCode()).containsOnly("102");
		assertThat(result.receivables()).extracting(value -> value.remaining()).containsExactly("100");
		assertThat(result.receivables()).extracting(value -> value.date()).containsOnly(LocalDate.of(2026, 10, 15));
		assertThat(result.records()).isEmpty();
		assertThat(result.expenses()).isEmpty();
		assertThat(result.otherIncomes()).isEmpty();
	}

	@Test
	void automaticallyRecognizesOtherIncomeAs901UsingActualDepositAmount() {
		AccountingAccount otherIncome = AccountingAccount.create(propertyId, "901", "영업외수익",
			IncomeGroup.OTHER_REVENUE, "OTHER_INCOME", actor, at);
		when(accounts.findByPropertyIdOrderByCreatedAtAscIdAsc(propertyId)).thenReturn(List.of(revenue, cost, otherIncome));
		var receipt = mock(BankingResponse.Transaction.class);
		UUID paymentId = UUID.randomUUID();
		when(receipt.id()).thenReturn(UUID.randomUUID());
		when(receipt.paymentId()).thenReturn(paymentId);
		when(receipt.date()).thenReturn(LocalDate.of(2026, 10, 19));
		when(receipt.direction()).thenReturn("INCOME");
		when(receipt.status()).thenReturn("CONFIRMED");
		when(receipt.receiptType()).thenReturn("OTHER");
		when(receipt.amount()).thenReturn("218");
		when(receipt.payer()).thenReturn("예금이자 248 소득세 30");
		when(banking.workspace(actor, propertyId)).thenReturn(new BankingResponse.Workspace(propertyId,
			LocalDate.of(2026, 11, 1), List.of(), List.of(), List.of(receipt), List.of()));
		var result = service.get(actor, propertyId, "2026-10", "2026-10", null);
		assertThat(result.issues()).isEmpty();
		assertThat(result.records()).singleElement().satisfies(value -> {
			assertThat(value.accountId()).isEqualTo(otherIncome.getId());
			assertThat(value.group()).isEqualTo("otherRevenue");
			assertThat(value.amount()).isEqualTo("218");
		});
		assertThat(result.otherIncomes().getFirst().id()).isEqualTo(paymentId);
	}

	@Test
	void matchesDefaultExpenseCodesAndAliasesWithoutCombiningDifferentCostSubjects() {
		assertThat(DefaultAccount.matchExpense("801 일반관리비")).contains(DefaultAccount.GENERAL_MANAGEMENT);
		assertThat(DefaultAccount.matchExpense("현대엘리베이터")).contains(DefaultAccount.ELEVATOR);
		assertThat(DefaultAccount.matchExpense("09전기요금")).contains(DefaultAccount.UTILITIES);
		assertThat(DefaultAccount.matchExpense("06월 문자수수료")).contains(DefaultAccount.COMMUNICATION);
		assertThat(DefaultAccount.matchExpense("보험료 ((보험사))")).contains(DefaultAccount.INSURANCE);
		assertThat(DefaultAccount.INSURANCE.getCode()).isEqualTo("812");
		assertThat(DefaultAccount.matchExpense("811")).contains(DefaultAccount.MISCELLANEOUS);
		assertThat(DefaultAccount.MISCELLANEOUS.getCode()).isEqualTo("813");
		assertThat(DefaultAccount.matchExpense("정화조 ((국민 계좌) 업체)")).contains(DefaultAccount.SEPTIC);
		assertThat(DefaultAccount.matchExpense("청소비 및 수선비")).isEmpty();
		assertThat(DefaultAccount.matchExpense("거래처만 있음")).isEmpty();
	}

	@Test
	void automaticallyMatchesExistingCostsAndRecognizesThemInTheExpenseDateMonth() {
		AccountingAccount utilities = AccountingAccount.create(propertyId, "804", "수도전기료",
			IncomeGroup.OPERATING_EXPENSE, null, actor, at);
		when(accounts.findByPropertyIdOrderByCreatedAtAscIdAsc(propertyId)).thenReturn(List.of(revenue, cost, utilities));
		UUID expenseId = UUID.randomUUID();
		var row = expense(expenseId);
		when(row.expense()).thenReturn(new BankingResponse.Expense(expenseId, "09전기요금", null, "PROPERTY", false, List.of()));
		when(row.date()).thenReturn(LocalDate.of(2026, 10, 12));
		when(banking.workspace(actor, propertyId)).thenReturn(new BankingResponse.Workspace(propertyId,
			LocalDate.of(2026, 11, 1), List.of(), List.of(), List.of(row), List.of()));
		var result = service.get(actor, propertyId, "2026-10", "2026-10", null);
		assertThat(result.expenses().getFirst().accountId()).isEqualTo(utilities.getId());
		assertThat(result.expenses().getFirst().recognitionMonth()).isEqualTo("2026-10");
		assertThat(result.issues()).isEmpty();
		assertThat(result.records()).singleElement().satisfies(record -> {
			assertThat(record.month()).isEqualTo("2026-10");
			assertThat(record.amount()).isEqualTo("100");
		});
		verify(reviews, never()).save(any());
	}


	/** 등록 시 선택이 지출명 자동 매칭보다 우선하고 이후 명시적 회계 정정이 다시 우선합니다. */
	@Test
	void initialExpenseSelectionOverridesNameMatchingAndLaterReviewOverridesSelection() {
		AccountingAccount elevator = AccountingAccount.create(propertyId, "803", "엘리베이터비",
		    IncomeGroup.OPERATING_EXPENSE, null, actor, at);
		when(accounts.findByPropertyIdOrderByCreatedAtAscIdAsc(propertyId)).thenReturn(List.of(revenue, cost, elevator));
		UUID id = UUID.randomUUID();
		var source = expense(id);
		when(source.expense()).thenReturn(new BankingResponse.Expense(id, "청소비", null, "PROPERTY", false,
		    List.of(), "803", "엘리베이터비"));
		when(source.date()).thenReturn(LocalDate.of(2026, 10, 12));
		when(banking.workspace(actor, propertyId)).thenReturn(new BankingResponse.Workspace(propertyId,
		    LocalDate.of(2026, 11, 1), List.of(), List.of(), List.of(source), List.of()));
		assertThat(service.get(actor, propertyId, "2026-10", "2026-10", null).expenses().getFirst().accountId())
		    .isEqualTo(elevator.getId());
		when(reviews.findByPropertyIdOrderByRevisionDesc(propertyId)).thenReturn(List.of(
		    ExpenseAccountingReview.create(propertyId, id, cost, YearMonth.of(2026, 10), 1, "cipher", actor, at)));
		assertThat(service.get(actor, propertyId, "2026-10", "2026-10", null).expenses().getFirst().accountId())
		    .isEqualTo(cost.getId());
	}


	/** 모르는 지출·동일 이름의 복수 후보를 잡비나 첫 과목으로 추정하지 않습니다. */
	@Test
	void unknownOrAmbiguousExpenseNamesRemainUnmatched() {
		assertThat(ExpenseAccountService.match("모르는 지출", List.of(cost))).isNull();
		AccountingAccount other = AccountingAccount.create(propertyId, "814", "청소비", IncomeGroup.OTHER_EXPENSE,
		    null, actor, at);
		assertThat(ExpenseAccountService.match("청소비", List.of(cost, other))).isNull();
	}

	@Test
	void automaticallyRecognizesStandardManagementChargesWithoutOpeningClassification() {
		when(billing.get(propertyId)).thenReturn(List.of(new BillingIncomeSource(UUID.randomUUID(), UUID.randomUUID(),
			"2026-10", "", "101", null, new BigDecimal("3000000"), List.of(new BillingIncomeSource.Item(
				UUID.randomUUID(), itemId, "일반관리비", FeeItemCode.GENERAL_MANAGEMENT, new BigDecimal("3000000"), null)))));
		var result = service.get(actor, propertyId, "2026-10", "2026-10", null);
		assertThat(result.records()).hasSize(1);
		assertThat(result.records().getFirst().accountId()).isEqualTo(revenue.getId());
		assertThat(result.revenueItems().getFirst().recognized()).isTrue();
		assertThat(result.issues()).isEmpty();
	}

	@Test
	void preservesExplicitHistoricAttributionAndDoesNotShowOutOfRangeExpenses() {
		UUID expenseId = UUID.randomUUID();
		var row = expense(expenseId);
		when(banking.workspace(actor, propertyId)).thenReturn(new BankingResponse.Workspace(propertyId,
			LocalDate.of(2026, 11, 1), List.of(), List.of(), List.of(row), List.of()));
		var pending = service.get(actor, propertyId, "2026-10", "2026-10", null);
		assertThat(pending.issues()).isEmpty();
		assertThat(pending.expenses()).isEmpty();
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
		verify(billing, never()).get(any());
		verifyNoInteractions(banking);
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
