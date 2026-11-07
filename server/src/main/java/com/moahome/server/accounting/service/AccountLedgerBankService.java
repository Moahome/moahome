package com.moahome.server.accounting.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import com.moahome.server.accounting.dto.AccountLedgerResponse.BankBalance;
import com.moahome.server.accounting.dto.AccountLedgerResponse.CashBalance;
import com.moahome.server.accounting.dto.IncomeStatementResponse;
import com.moahome.server.accounting.dto.IncomeStatementResponse.Entry;
import com.moahome.server.accounting.dto.IncomeStatementResponse.Source;
import com.moahome.server.banking.dto.BankingBalanceResponse;
import com.moahome.server.banking.dto.BankingResponse;
import com.moahome.server.banking.service.BankingBalanceService;
import com.moahome.server.banking.service.BankingService;

/** 101은 통장마다 기존 현금 원장의 기초·기말과 은행 원본 잔액을 연결합니다. */
@Service
public class AccountLedgerBankService {
	private final BankingService banking;
	private final BankingBalanceService balances;
	public AccountLedgerBankService(BankingService banking, BankingBalanceService balances) {
		this.banking = banking;
		this.balances = balances;
	}
	public record Projection(List<Entry> entries, List<BankBalance> balances, Map<String, CashBalance> cash, Map<String, UUID> transferGroups) {
		public Projection(List<Entry> entries, List<BankBalance> balances, Map<String, CashBalance> cash) {
			this(entries, balances, cash, Map.of());
		}
	}

	/** 은행 연결·자동 이체·수기 이동의 중복을 제거하고 기존 잔고 계산값을 사용합니다. 확인값을 0으로 대체하지 않습니다. */
	public Projection get(UUID actor, UUID property, IncomeStatementResponse source, UUID buildingId) {
		var account = source.accounts().stream().filter(value -> "BANK".equals(value.systemKey())).findFirst().orElseThrow();
		String start = source.range().startMonth(), end = source.range().endMonth();
		LocalDate first = YearMonth.parse(start).atDay(1), last = YearMonth.parse(end).atEndOfMonth();
		BankingResponse.Workspace workspace = banking.workspace(actor, property);
		BankingBalanceResponse.Workspace snapshot = balances.workspace(actor, property, start, end, null);
		List<Entry> entries = new ArrayList<>();
		Map<String, CashBalance> cash = new HashMap<>();
		Map<String, UUID> transferGroups = new HashMap<>();
		Map<UUID, String> names = new HashMap<>();
		for (var bank : workspace.accounts())
			names.put(bank.id(), bank.alias() != null && !bank.alias().isBlank() ? bank.alias() : bank.bankName() + " " + bank.last4());
		if (buildingId != null) {
			int index = 0;
			for (var row : snapshot.entries()) {
				if (!buildingId.equals(row.buildingId()) || row.accountId() == null) continue;
				String key = "bank-building:" + row.id() + ":" + index++;
				String path = "/banking/balances/" + buildingId + "?startMonth=" + start + "&endMonth=" + end;
				entries.add(new Entry(key, account.id(), account.name(), "asset", YearMonth.from(row.date()).toString(),
					buildingId, new BigDecimal(row.income()).subtract(new BigDecimal(row.expense())).toPlainString(),
					new Source("BANK", row.id(), row.date(), row.time(), row.label(), "", path)));
				cash.put(key, new CashBalance(row.accountId(), names.getOrDefault(row.accountId(), "통장"), null, null));
				workspace.rows().stream().filter(value -> value.id().equals(row.transactionId()) || value.id().equals(row.id()))
					.filter(value -> value.transferId() != null).findFirst().ifPresent(value -> transferGroups.put(key, value.transferId()));
			}
		} else {
			Map<UUID, BankingResponse.Transaction> rows = new HashMap<>();
			workspace.rows().forEach(row -> rows.put(row.id(), row));
			banking.manualIncomeSources(actor, property).forEach(row -> rows.putIfAbsent(row.id(), row));
			for (var row : rows.values()) {
				// 수납 분류 취소는 은행의 실제 입금을 없애지 않으며, 취소 이체만 현금 원장에서 제외합니다.
				if (row.date().isBefore(first) || row.date().isAfter(last)
					|| ("CANCELED".equals(row.status()) && row.transferId() != null)) continue;
				String key = "bank:" + row.id();
				String name = row.memo() == null || row.memo().isBlank() ? row.payer() : row.memo();
				if (name == null || name.isBlank()) name = "EXPENSE".equals(row.direction()) ? "출금" : "입금";
				BigDecimal amount = new BigDecimal(row.amount());
				if ("EXPENSE".equals(row.direction())) amount = amount.negate();
				entries.add(new Entry(key, account.id(), account.name(), "asset", YearMonth.from(row.date()).toString(), null,
					amount.toPlainString(), new Source("BANK", row.id(), row.date(), row.time(), name, "",
						"/banking/transactions?account=" + row.accountId() + "&startDate=" + row.date() + "&endDate=" + row.date())));
				cash.put(key, new CashBalance(row.accountId(), names.getOrDefault(row.accountId(), "통장"), null, row.balance()));
				if (row.transferId() != null) transferGroups.put(key, row.transferId());
			}
		}
		List<BankBalance> result = new ArrayList<>();
		for (var bank : snapshot.accounts()) {
			List<Entry> movements = entries.stream().filter(row -> bank.id().equals(cash.get(row.id()).bankAccountId())).toList();
			BigDecimal income = movements.stream().map(row -> new BigDecimal(row.amount())).filter(value -> value.signum() > 0)
				.reduce(BigDecimal.ZERO, BigDecimal::add);
			BigDecimal expense = movements.stream().map(row -> new BigDecimal(row.amount())).filter(value -> value.signum() < 0)
				.reduce(BigDecimal.ZERO, BigDecimal::add).negate();
			String closing = bank.calculatedBalance();
			String opening = closing == null ? null : new BigDecimal(closing).subtract(income).add(expense).toPlainString();
			if (buildingId != null) {
				var building = snapshot.buildings().stream().filter(value -> value.id().equals(buildingId)).findFirst().orElse(null);
				var owned = building == null ? null : building.accountBalances().stream()
					.filter(value -> value.accountId().equals(bank.id())).findFirst().orElse(null);
				opening = owned == null ? null : owned.startBalance();
				closing = owned == null ? null : owned.balance();
			}
			result.add(new BankBalance(bank.id(), names.getOrDefault(bank.id(), "통장"), opening,
				income.toPlainString(), expense.toPlainString(), closing));
		}
		return new Projection(List.copyOf(entries), List.copyOf(result), Map.copyOf(cash), Map.copyOf(transferGroups));
	}
}
