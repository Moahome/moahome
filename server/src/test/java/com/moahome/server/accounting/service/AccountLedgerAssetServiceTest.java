package com.moahome.server.accounting.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import com.moahome.server.accounting.dto.IncomeStatementResponse;
import com.moahome.server.expense.service.PayableSourceService;
import com.moahome.server.accounting.dto.IncomeStatementResponse.Account;
import com.moahome.server.banking.dto.BankingBalanceResponse;
import com.moahome.server.banking.dto.BankingResponse;
import com.moahome.server.banking.domain.BankTransferPosting;
import com.moahome.server.banking.service.BankingService;
import com.moahome.server.banking.service.BankingBalanceService;
import com.moahome.server.banking.service.BankTransferPostingService;
import com.moahome.server.billing.service.BillingIncomeSourceService;
import com.moahome.server.billing.service.BillingIncomeSourceService.ReceivableSource;
import com.moahome.server.payment.dto.PaymentResponse;
import com.moahome.server.payment.service.PaymentService;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AccountLedgerAssetServiceTest {
	private final BankingService banking = mock(BankingService.class);
	private final BankingBalanceService balances = mock(BankingBalanceService.class);
	private final BankTransferPostingService transfers = mock(BankTransferPostingService.class);
	private final PaymentService payments = mock(PaymentService.class);
	private final BillingIncomeSourceService billing = mock(BillingIncomeSourceService.class);
	private final AccountLedgerAssetService service = new AccountLedgerAssetService(banking, balances, transfers, payments, billing, mock(PayableSourceService.class));
	private final UUID actor = UUID.randomUUID();
	private final UUID property = UUID.randomUUID();
	private final UUID building = UUID.randomUUID();
	private final UUID unit = UUID.randomUUID();
	private final UUID october = UUID.randomUUID();
	private final UUID november = UUID.randomUUID();
	private final Account bank = new Account(UUID.randomUUID(), "101", "통장", "asset", "BANK");
	private final Account receivable = new Account(UUID.randomUUID(), "102", "미수금", "asset", "RECEIVABLE");
	private final Account transfer = new Account(UUID.randomUUID(), "103", "통장간 거래", "asset", null);
	private final Account advance = new Account(UUID.randomUUID(), "201", "선수금", "liability", "ADVANCE_RECEIPT");

	@Test
	void receiptsReduceReceivablesAndOnlyExcessBecomesAdvanceUntilFutureChargeDate() {
		when(billing.receivables(property)).thenReturn(List.of(charge(october, "2026-10-01", "50000"),
			charge(november, "2026-11-01", "50000")));
		PaymentResponse.Payment confirmed = payment("CONFIRMED", "120000", List.of(
			new PaymentResponse.Allocation(october, "50000"), new PaymentResponse.Allocation(november, "50000")));
		when(payments.workspace(actor, property)).thenReturn(ledger(List.of(confirmed, payment("CANCELED", "999999", List.of()))));
		when(balances.workspace(actor, property, "2026-10", "2026-11", null)).thenReturn(balance(List.of()));
		var debt = service.get(actor, property, source(), receivable.id(), null);
		assertThat(debt).hasSize(4);
		assertThat(debt.stream().map(row -> new BigDecimal(row.amount())).reduce(BigDecimal.ZERO, BigDecimal::add))
			.isEqualByComparingTo("0");
		assertThat(debt).anySatisfy(row -> {
			assertThat(row.source().date()).isEqualTo(LocalDate.parse("2026-11-01"));
			assertThat(row.amount()).isEqualTo("-50000");
		});
		var credit = service.get(actor, property, source(), advance.id(), null);
		assertThat(credit).extracting(row -> row.amount()).containsExactly("70000", "-50000");
		assertThat(credit).extracting(row -> row.source().date()).containsExactly(LocalDate.parse("2026-10-15"), LocalDate.parse("2026-11-01"));
		assertThat(service.get(actor, property, source(), advance.id(), UUID.randomUUID())).isEmpty();
	}

	@Test
	void paidExactlyDoesNotCreateAnAdvanceReceiptOrDuplicateRevenue() {
		when(billing.receivables(property)).thenReturn(List.of(charge(october, "2026-10-01", "50000")));
		when(payments.workspace(actor, property)).thenReturn(ledger(List.of(payment("CONFIRMED", "50000",
			List.of(new PaymentResponse.Allocation(october, "50000"))))));
		assertThat(service.get(actor, property, source(), advance.id(), null)).isEmpty();
	}

	@Test
	void openingCreditIsReusedWithoutCreatingCashAndExternalExclusionDoesNotWriteOffDebt() {
		when(billing.receivables(property)).thenReturn(List.of(charge(november, "2026-11-01", "50000")));
		PaymentResponse.Ledger ledger = ledger(List.of());
		when(payments.workspace(actor, property)).thenReturn(new PaymentResponse.Ledger(property, ledger.asOf(),
			ledger.accounts(), ledger.units(), ledger.charges(), ledger.payments(), ledger.history(),
			List.of(new PaymentResponse.OpeningCredit(UUID.randomUUID(), unit, LocalDate.parse("2026-10-01"), "70000",
				List.of(new PaymentResponse.Allocation(november, "50000")))), ledger.buildings()));
		var credit = service.get(actor, property, source(), advance.id(), null);
		assertThat(credit).extracting(row -> row.amount()).containsExactly("70000", "-50000");
		assertThat(credit).allMatch(row -> row.source().kind().equals("OPENING_CREDIT"));
		UUID payment = UUID.randomUUID();
		BankingBalanceResponse.External external = new BankingBalanceResponse.External(UUID.randomUUID(), "외부 업체", "수리비",
			LocalDate.parse("2026-10-03"), "100000", "30000", "70000", List.of(new BankingBalanceResponse.Recovery(
				UUID.randomUUID(), payment, LocalDate.parse("2026-11-05"), "업체", "30000")), true, 1);
		when(balances.workspace(actor, property, "2026-10", "2026-11", null)).thenReturn(balance(List.of(external)));
		var debt = service.get(actor, property, source(), receivable.id(), null);
		assertThat(debt).filteredOn(row -> row.source().kind().equals("EXTERNAL")).singleElement()
			.satisfies(row -> assertThat(row.amount()).isEqualTo("100000"));
		assertThat(debt).anyMatch(row -> row.amount().equals("-30000") && row.source().path().endsWith(payment.toString()));
	}

	@Test
	void transferUsesStoredAccountIdAndKeepsBothSidesOnceWhileCanceledRowsAreExcluded() {
		UUID source = UUID.randomUUID();
		UUID counterpart = UUID.randomUUID();
		UUID postingId = UUID.randomUUID();
		BankTransferPosting posting = BankTransferPosting.create(postingId, property, source, UUID.randomUUID(), transfer.id(),
			actor, OffsetDateTime.now());
		when(transfers.all(property)).thenReturn(List.of(posting));
		when(banking.workspace(actor, property)).thenReturn(new BankingResponse.Workspace(property, LocalDate.parse("2026-11-07"),
			List.of(), List.of(), List.of(transaction(source, postingId, "EXPENSE", "TRANSFER"),
				transaction(counterpart, postingId, "INCOME", "TRANSFER"), transaction(UUID.randomUUID(), null, "INCOME", "CANCELED")), List.of()));
		var rows = service.get(actor, property, source(), transfer.id(), null);
		assertThat(rows).hasSize(2).allMatch(row -> row.accountId().equals(transfer.id()));
		assertThat(rows).extracting(row -> row.amount()).containsExactly("-100000", "100000");
	}

	@Test
	void bankIncludesActualPendingMovementAndManualReceiptWithoutCanceledAmounts() {
		when(banking.workspace(actor, property)).thenReturn(new BankingResponse.Workspace(property, LocalDate.parse("2026-11-07"),
			List.of(), List.of(), List.of(transaction(UUID.randomUUID(), null, "INCOME", "PENDING"),
				transaction(UUID.randomUUID(), null, "INCOME", "CANCELED")), List.of()));
		when(payments.workspace(actor, property)).thenReturn(ledger(List.of(payment("CONFIRMED", "12000", List.of()),
			payment("CANCELED", "999999", List.of()))));
		var rows = service.get(actor, property, source(), bank.id(), null);
		assertThat(rows).hasSize(2).allMatch(row -> row.accountId().equals(bank.id()));
		assertThat(rows).extracting(row -> row.amount()).containsExactly("100000", "12000");
	}

	@Test
	void bankBuildingFilterUsesSavedOwnershipPartsRatherThanFullBankAmounts() {
		when(banking.workspace(actor, property)).thenReturn(new BankingResponse.Workspace(property, LocalDate.parse("2026-11-07"),
			List.of(), List.of(), List.of(transaction(UUID.randomUUID(), null, "EXPENSE", "CONFIRMED")), List.of()));
		BankingBalanceResponse.Workspace balance = balance(List.of());
		when(balances.workspace(actor, property, "2026-10", "2026-11", null)).thenReturn(new BankingBalanceResponse.Workspace(
			property, balance.month(), null, "0", "", List.of(), List.of(new BankingBalanceResponse.Entry(UUID.randomUUID(),
				building, LocalDate.parse("2026-10-20"), null, "확정 부담분", "0", "30000", null)), List.of(), List.of(), List.of()));
		var rows = service.get(actor, property, source(), bank.id(), building);
		assertThat(rows).singleElement().satisfies(row -> {
			assertThat(row.amount()).isEqualTo("-30000");
			assertThat(row.buildingId()).isEqualTo(building);
		});
	}

	private ReceivableSource charge(UUID id, String date, String amount) {
		return new ReceivableSource(id, unit, "102동", "201", LocalDate.parse(date), new BigDecimal(amount), false);
	}

	private PaymentResponse.Payment payment(String status, String amount, List<PaymentResponse.Allocation> allocations) {
		return new PaymentResponse.Payment(UUID.randomUUID(), "MANUAL", status, UUID.randomUUID(), LocalDate.parse("2026-10-15"),
			"입금자", amount, unit.toString(), "", allocations, null, null, "", "", "", "", "HOUSEHOLD", "", "");
	}

	private PaymentResponse.Ledger ledger(List<PaymentResponse.Payment> rows) {
		return new PaymentResponse.Ledger(property, LocalDate.parse("2026-11-07"), List.of(),
			List.of(new PaymentResponse.Unit(unit, "102동 201호", "ACTIVE", true, null, "", List.of(), "102동")), List.of(), rows,
			List.of(), List.of(), List.of(new PaymentResponse.Building(building, "102동")));
	}

	private BankingResponse.Transaction transaction(UUID id, UUID posting, String direction, String status) {
		return new BankingResponse.Transaction(id, UUID.randomUUID(), LocalDate.parse("2026-10-20"), null, "통장 이동", "",
			"100000", null, direction, "", null, status, "", "", null, null, null, true, posting);
	}

	private BankingBalanceResponse.Workspace balance(List<BankingBalanceResponse.External> external) {
		return new BankingBalanceResponse.Workspace(property, "2026-11", null, "0", "", List.of(), List.of(), external, List.of(), List.of());
	}

	private IncomeStatementResponse source() {
		return new IncomeStatementResponse(property, "테스트", OffsetDateTime.now(), new IncomeStatementResponse.Range("2026-10", "2026-11"),
			new IncomeStatementResponse.Configuration("2026-10", 1), true, "READY",
			List.of(new IncomeStatementResponse.Building(building, "102동", false)), List.of(bank, receivable, transfer, advance),
			List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
	}
}
