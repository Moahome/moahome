package com.moahome.server.accounting.service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.ArrayList;
import java.util.Collections;
import com.moahome.server.accounting.dto.AccountLedgerResponse;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import java.util.Map;
import static org.mockito.ArgumentMatchers.any;
import com.moahome.server.accounting.dto.IncomeStatementResponse;
import com.moahome.server.accounting.dto.IncomeStatementResponse.Account;
import com.moahome.server.accounting.dto.IncomeStatementResponse.Entry;
import com.moahome.server.accounting.dto.IncomeStatementResponse.Source;
import com.moahome.server.accounting.exception.AccountingException;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

class AccountLedgerServiceTest {
	private final IncomeStatementService income = mock(IncomeStatementService.class);
	private final AccountLedgerAssetService assets = mock(AccountLedgerAssetService.class);
	private final AccountLedgerBankService bankService = mock(AccountLedgerBankService.class);
	private final AccountLedgerService service = new AccountLedgerService(income, assets, bankService);
	private final UUID actor = UUID.randomUUID();
	private final UUID property = UUID.randomUUID();
	private final UUID revenue = UUID.randomUUID();
	private final UUID expense = UUID.randomUUID();
	private final UUID bank = UUID.randomUUID();
	private final UUID receivable = UUID.randomUUID();
	private final UUID building = UUID.randomUUID();
	private final List<Account> accounts = List.of(new Account(revenue, "401", "관리비수입", "operatingRevenue", null),
		new Account(expense, "802", "청소비", "operatingExpense", null), new Account(bank, "101", "통장", "asset", "BANK"),
		new Account(receivable, "102", "미수금", "asset", "RECEIVABLE"));

	@BeforeEach
	void bankProjection() {
		when(bankService.get(any(), any(), any(), any()))
			.thenReturn(new AccountLedgerBankService.Projection(List.of(), List.of(), Map.of()));
	}

	@Test
	void groupsTwentyHouseholdChargesIntoOneMonthlyRevenueWithoutChangingSourceAmounts() {
		List<Entry> charges = IntStream.range(0, 20).mapToObj(index ->
			new Entry("charge:" + UUID.randomUUID(), revenue, "관리비수입", "operatingRevenue", "2026-11",
				building, "50000", new Source("CHARGE", UUID.randomUUID(), LocalDate.of(2026, 11, 1), null, "일반관리비",
					"세대별 부과", "/banking/monthly/2026-11/" + UUID.randomUUID() + "?month=2026-11"))).toList();
		when(income.get(actor, property, "2026-11", "2026-11", null)).thenReturn(source("READY", charges));
		var result = service.get(actor, property, "2026-11", "2026-11", null, revenue);
		assertThat(result.rows()).singleElement().satisfies(row -> {
			assertThat(row.entry().amount()).isEqualTo("1000000");
			assertThat(row.entry().buildingId()).isNull();
			assertThat(row.entry().source().kind()).isEqualTo("BILLING");
			assertThat(row.entry().source().date()).isEqualTo(LocalDate.of(2026, 11, 1));
			assertThat(row.entry().source().path()).isEqualTo("/billing/monthly/history/2026-11");
			assertThat(row.sourceIds()).containsExactlyInAnyOrderElementsOf(charges.stream().map(Entry::id).toList());
		});
		assertThat(result.revenue()).isEqualTo("1000000");
		assertThat(charges).allMatch(entry -> entry.amount().equals("50000"));
	}

	@Test
	void keepsSelectedBuildingAndMonthScopesSeparateWhenGroupingRevenue() {
		Entry october = new Entry("charge:" + UUID.randomUUID(), revenue, "관리비수입", "operatingRevenue", "2026-10",
			building, "50000", new Source("CHARGE", UUID.randomUUID(), LocalDate.of(2026, 10, 1), null, "일반관리비", "", ""));
		Entry november = new Entry("charge:" + UUID.randomUUID(), revenue, "관리비수입", "operatingRevenue", "2026-11",
			building, "50000", new Source("CHARGE", UUID.randomUUID(), LocalDate.of(2026, 11, 1), null, "일반관리비", "", ""));
		when(income.get(actor, property, "2026-10", "2026-11", building))
			.thenReturn(source("READY", List.of(october, november)));
		var result = service.get(actor, property, "2026-10", "2026-11", building, revenue);
		assertThat(result.rows()).hasSize(2).allSatisfy(row -> assertThat(row.entry().buildingId()).isEqualTo(building));
		assertThat(result.rows().getFirst().entry().month()).isEqualTo("2026-11");
		assertThat(result.rows().getFirst().cumulativeAmount()).isEqualTo("100000");
	}

	@Test
	void reconcilesIncomeTotalsAndPreservesPerAccountCumulativeAmountsInNewestFirstOrder() {
		when(income.get(actor, property, "2026-10", "2026-11", null)).thenReturn(source("READY", List.of(
			entry("a", revenue, "100", "2026-10", "2026-10-01", "10:00"),
			entry("b", expense, "40", "2026-10", "2026-10-03", "08:00"),
			entry("c", revenue, "70", "2026-11", "2026-11-03", "08:00"))));
		var result = service.get(actor, property, "2026-10", "2026-11", null, null);
		assertThat(result.revenue()).isEqualTo("170");
		assertThat(result.expense()).isEqualTo("40");
		assertThat(result.rows()).extracting(row -> row.entry().id()).containsExactly("c", "b", "a");
		assertThat(result.rows()).extracting(row -> row.cumulativeAmount()).containsExactly("170", "40", "100");
	}

	@Test
	void delegatesScopeAndAuthorizationAndFiltersAccountBeforeAccumulation() {
		when(income.get(actor, property, "2026-10", "2026-11", building)).thenReturn(source("READY", List.of(
			entry("a", revenue, "100", "2026-10", "2026-10-01", "10:00"),
			entry("b", expense, "40", "2026-10", "2026-10-03", "08:00"))));
		var result = service.get(actor, property, "2026-10", "2026-11", building, expense);
		assertThat(result.revenue()).isEqualTo("0");
		assertThat(result.expense()).isEqualTo("40");
		assertThat(result.rows()).hasSize(1);
		verify(income).get(actor, property, "2026-10", "2026-11", building);
		assertThatThrownBy(() -> service.get(actor, property, "2026-10", "2026-11", building, UUID.randomUUID()))
			.isInstanceOf(AccountingException.class);
	}

	@Test
	void assetAccountUsesExistingAssetSourcesWithoutAddingIncome() {
		when(income.get(actor, property, "2026-10", "2026-11", null)).thenReturn(source("READY", List.of()));
		var result = service.get(actor, property, "2026-10", "2026-11", null, bank);
		assertThat(result.supported()).isTrue();
		assertThat(result.rows()).isEmpty();
	}

	@Test
	void sortsByOriginalTransactionTimeAndKeepsExplicitRecognitionMonth() {
		when(income.get(actor, property, "2026-10", "2026-11", null)).thenReturn(source("READY", List.of(
			entry("late", expense, "40", "2026-10", "2026-11-03", "12:30"),
			entry("early", expense, "60", "2026-11", "2026-11-03", "08:00"))));
		var result = service.get(actor, property, "2026-10", "2026-11", null, null);
		assertThat(result.rows()).extracting(row -> row.entry().id()).containsExactly("late", "early");
		assertThat(result.rows().getFirst().entry().month()).isEqualTo("2026-10");
		assertThat(result.rows().getFirst().cumulativeAmount()).isEqualTo("100");
	}

	@Test
	void setupAndStartRestrictionsAreReturnedWithoutCreatingRecords() {
		when(income.get(actor, property, null, null, null)).thenReturn(source("BEFORE_START", List.of()));
		var result = service.get(actor, property, null, null, null, null);
		assertThat(result.completeness()).isEqualTo("BEFORE_START");
		assertThat(result.rows()).isEmpty();
	}

	@Test
	void sameDateAccumulatesChargesInNumericUnitOrderBeforeApplyingReceipts() {
		when(income.get(actor, property, "2026-10", "2026-11", null)).thenReturn(source("READY", List.of()));
		List<Entry> unsorted = List.of(
			asset("z", "103동 1001호 관리비 부과", "50000", "RECEIVABLE"),
			asset("a", "103동 401호 수납 충당", "-50000", "RECEIPT"),
			asset("b", "103동 402호 관리비 부과", "50000", "RECEIVABLE"),
			asset("y", "102동 201호 관리비 부과", "50000", "RECEIVABLE"),
			asset("m", "103동 601호 관리비 부과", "50000", "RECEIVABLE"));
		when(assets.get(actor, property, source("READY", List.of()), receivable, null)).thenReturn(unsorted);
		var result = service.get(actor, property, "2026-10", "2026-11", null, receivable);
		List<AccountLedgerResponse.Row> chronological = new ArrayList<>(result.rows());
		Collections.reverse(chronological);
		assertThat(chronological).extracting(row -> row.entry().source().name()).containsExactly(
			"102동 201호 관리비 부과", "103동 402호 관리비 부과", "103동 601호 관리비 부과", "103동 1001호 관리비 부과", "103동 401호 수납 충당");
		assertThat(chronological).extracting(row -> row.cumulativeAmount()).containsExactly("50000", "100000", "150000", "200000", "150000");
	}

	@Test
	void multipleSelectedAccountsKeepIndependentTotalsAndRejectForeignAccount() {
		when(income.get(actor, property, "2026-10", "2026-11", null)).thenReturn(source("READY", List.of(
			entry("a", revenue, "100", "2026-10", "2026-10-01", "10:00"),
			entry("b", expense, "40", "2026-10", "2026-10-03", "08:00"),
			entry("c", revenue, "70", "2026-11", "2026-11-03", "08:00"))));
		var result = service.getSelected(actor, property, "2026-10", "2026-11", null, List.of(revenue, expense, revenue));
		assertThat(result.accountId()).isNull();
		assertThat(result.accountIds()).containsExactlyInAnyOrder(revenue, expense);
		assertThat(result.rows()).extracting(row -> row.cumulativeAmount()).containsExactly("170", "40", "100");
		assertThat(result.revenue()).isEqualTo("170");
		assertThat(result.expense()).isEqualTo("40");
		assertThatThrownBy(() -> service.getSelected(actor, property, "2026-10", "2026-11", null, List.of(revenue, UUID.randomUUID())))
			.isInstanceOf(AccountingException.class);
	}

	@Test
	void bankUsesCombinedOpeningAndTreatsInternalTransferAsOneMovementAndSupportsSingleBank() {
		UUID first = UUID.randomUUID(), second = UUID.randomUUID(), transfer = UUID.randomUUID();
		var source = source("READY", List.of());
		List<Entry> movements = List.of(bankEntry("deposit", "100", "2026-10-01"),
			bankEntry("out", "-40", "2026-10-02"), bankEntry("in", "40", "2026-10-02"),
			bankEntry("expense", "-50", "2026-10-03"));
		var cashFirst = new AccountLedgerResponse.CashBalance(first, "공용", null, null);
		var cashSecond = new AccountLedgerResponse.CashBalance(second, "예비비", null, null);
		when(income.get(actor, property, "2026-10", "2026-11", null)).thenReturn(source);
		when(bankService.get(actor, property, source, null)).thenReturn(new AccountLedgerBankService.Projection(movements,
			List.of(new AccountLedgerResponse.BankBalance(first, "공용", "200", "100", "90", "210"),
				new AccountLedgerResponse.BankBalance(second, "예비비", "300", "40", "0", "340")),
			Map.of("deposit", cashFirst, "out", cashFirst, "in", cashSecond, "expense", cashFirst),
			Map.of("out", transfer, "in", transfer)));
		var combined = service.get(actor, property, "2026-10", "2026-11", null, bank);
		assertThat(combined.rows()).extracting(row -> row.cashBalance().ledgerBalance()).containsExactly("550", "600", "600", "600");
		var selected = service.getSelected(actor, property, "2026-10", "2026-11", null, List.of(bank), first);
		assertThat(selected.rows()).hasSize(3).allSatisfy(row -> assertThat(row.cashBalance().bankAccountId()).isEqualTo(first));
		assertThat(selected.rows()).extracting(row -> row.cashBalance().ledgerBalance()).containsExactly("210", "260", "300");
		assertThatThrownBy(() -> service.getSelected(actor, property, "2026-10", "2026-11", null, List.of(bank), UUID.randomUUID()))
			.isInstanceOf(AccountingException.class);
	}

	private Entry bankEntry(String id, String amount, String date) {
		return new Entry(id, bank, "통장", "asset", "2026-10", null, amount,
			new Source("BANK", UUID.randomUUID(), LocalDate.parse(date), null, id, "", ""));
	}

	private Entry asset(String key, String name, String amount, String kind) {
		return new Entry(key, receivable, "미수금", "asset", "2026-11", building, amount,
			new Source(kind, UUID.randomUUID(), LocalDate.parse("2026-11-01"), null, name, "", ""));
	}

	private IncomeStatementResponse source(String completeness, List<Entry> entries) {
		return new IncomeStatementResponse(property, "테스트", OffsetDateTime.parse("2026-11-07T00:00:00Z"),
			new IncomeStatementResponse.Range("2026-10", "2026-11"),
			new IncomeStatementResponse.Configuration("2026-10", 1), true, completeness,
			List.of(new IncomeStatementResponse.Building(building, "102동", false)), accounts, entries,
			List.of(), List.of(), List.of(), List.of(), List.of());
	}

	private Entry entry(String key, UUID account, String amount, String month, String date, String time) {
		Account selected = accounts.stream().filter(value -> value.id().equals(account)).findFirst().orElseThrow();
		return new Entry(key, account, selected.name(), selected.group(), month, building, amount,
			new Source("EXPENSE", UUID.randomUUID(), LocalDate.parse(date), LocalTime.parse(time), "원본", "원본 정보", "/banking/transactions/" + UUID.randomUUID()));
	}
}
