package com.moahome.server.accounting.service;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import com.moahome.server.accounting.dto.IncomeStatementResponse;
import com.moahome.server.banking.dto.BankingBalanceResponse;
import com.moahome.server.banking.dto.BankingResponse;
import com.moahome.server.banking.service.BankingBalanceService;
import com.moahome.server.banking.service.BankingService;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AccountLedgerBankServiceTest {
	private final BankingService banking = mock(BankingService.class);
	private final BankingBalanceService balances = mock(BankingBalanceService.class);
	private final AccountLedgerBankService service = new AccountLedgerBankService(banking, balances);
	private final UUID actor = UUID.randomUUID(), property = UUID.randomUUID(), account = UUID.randomUUID();
	private final UUID first = UUID.randomUUID(), second = UUID.randomUUID();

	@Test
	void keepsPhysicalBanksSeparateAndRetainsImportedBalanceAndUnknownOpening() {
		var original = row(first, "50000", "INCOME", "260000", "CONFIRMED", null);
		var manual = row(first, "40000", "EXPENSE", null, "CONFIRMED", null);
		var other = row(second, "1000", "INCOME", null, "CONFIRMED", null);
		when(banking.workspace(actor, property)).thenReturn(new BankingResponse.Workspace(property, LocalDate.of(2026, 11, 7),
			List.of(), List.of(), List.of(original, manual, other), List.of(), List.of(
				new BankingResponse.Account(first, "가상은행", "1234", "공용 통장", true, "ACTIVE", null, null),
				new BankingResponse.Account(second, "다른은행", "5678", null, false, "ACTIVE", null, null))));
		// 같은 원본이 보충 조회에도 나타나더라도 실제 이동은 한 번만 반영합니다.
		when(banking.manualIncomeSources(actor, property)).thenReturn(List.of(original));
		when(balances.workspace(actor, property, "2026-10", "2026-10", null)).thenReturn(snapshot(
			new BankingBalanceResponse.AccountBalance(first, "", "READY", null, null, null, null, 0, "260000", null),
			new BankingBalanceResponse.AccountBalance(second, "", "READY", null, null)));
		var result = service.get(actor, property, source(), null);
		assertThat(result.entries()).hasSize(3);
		assertThat(result.balances().getFirst()).satisfies(value -> {
			assertThat(value.name()).isEqualTo("공용 통장");
			assertThat(value.openingBalance()).isEqualTo("250000");
			assertThat(value.income()).isEqualTo("50000");
			assertThat(value.expense()).isEqualTo("40000");
			assertThat(value.closingBalance()).isEqualTo("260000");
		});
		assertThat(result.balances().getLast()).satisfies(value -> {
			assertThat(value.name()).isEqualTo("다른은행 5678");
			assertThat(value.openingBalance()).isNull();
			assertThat(value.closingBalance()).isNull();
			assertThat(value.income()).isEqualTo("1000");
		});
		assertThat(result.cash().get("bank:" + original.id()).reportedBalance()).isEqualTo("260000");
		assertThat(result.cash().get("bank:" + manual.id()).reportedBalance()).isNull();
	}

	@Test
	void receiptClassificationCancellationKeepsRealBankCashButCanceledTransferDoesNot() {
		var receipt = row(first, "50000", "INCOME", "50000", "CANCELED", null);
		var transfer = row(first, "10000", "EXPENSE", "40000", "CANCELED", UUID.randomUUID());
		when(banking.workspace(actor, property)).thenReturn(new BankingResponse.Workspace(property, LocalDate.of(2026, 11, 7),
			List.of(), List.of(), List.of(receipt, transfer), List.of(), List.of()));
		when(balances.workspace(actor, property, "2026-10", "2026-10", null)).thenReturn(snapshot(
			new BankingBalanceResponse.AccountBalance(first, "", "READY", null, null, null, null, 0, "50000", null)));
		var result = service.get(actor, property, source(), null);
		assertThat(result.entries()).singleElement().satisfies(value -> assertThat(value.amount()).isEqualTo("50000"));
		assertThat(result.balances().getFirst().closingBalance()).isEqualTo("50000");
	}

	private BankingResponse.Transaction row(UUID bank, String amount, String direction, String balance, String status, UUID transfer) {
		return new BankingResponse.Transaction(UUID.randomUUID(), bank, LocalDate.of(2026, 10, 15), null,
			"거래", "거래 내용", amount, balance, direction, "", null, status, "", "", null, null, null, false, transfer);
	}

	private BankingBalanceResponse.Workspace snapshot(BankingBalanceResponse.AccountBalance... accounts) {
		return new BankingBalanceResponse.Workspace(property, "2026-10", null, null, null,
			List.of(), List.of(), List.of(), List.of(), List.of(), List.of(accounts), null, null);
	}

	private IncomeStatementResponse source() {
		return new IncomeStatementResponse(property, "테스트", OffsetDateTime.parse("2026-11-07T00:00:00Z"),
			new IncomeStatementResponse.Range("2026-10", "2026-10"), new IncomeStatementResponse.Configuration("2026-10", 1),
			true, "READY", List.of(), List.of(new IncomeStatementResponse.Account(account, "101", "통장", "asset", "BANK")),
			List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
	}
}
