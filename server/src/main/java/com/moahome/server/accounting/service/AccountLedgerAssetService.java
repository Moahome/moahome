package com.moahome.server.accounting.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import com.moahome.server.accounting.domain.DefaultAccount;
import com.moahome.server.expense.service.PayableSourceService;
import com.moahome.server.accounting.dto.IncomeStatementResponse;
import com.moahome.server.accounting.dto.IncomeStatementResponse.Account;
import com.moahome.server.accounting.dto.IncomeStatementResponse.Entry;
import com.moahome.server.accounting.dto.IncomeStatementResponse.Source;
import com.moahome.server.banking.dto.BankingBalanceResponse;
import com.moahome.server.banking.dto.BankingResponse;
import com.moahome.server.banking.domain.BankTransferPosting;
import com.moahome.server.banking.service.BankingBalanceService;
import com.moahome.server.banking.service.BankingService;
import com.moahome.server.banking.service.BankTransferPostingService;
import com.moahome.server.billing.service.BillingIncomeSourceService;
import com.moahome.server.billing.service.BillingIncomeSourceService.ReceivableSource;
import com.moahome.server.payment.dto.PaymentResponse;
import com.moahome.server.payment.service.PaymentService;

@Service
public class AccountLedgerAssetService {
	private final PayableSourceService payableSources;
	private final BankingService banking;
	private final BankingBalanceService balances;
	private final BankTransferPostingService transfers;
	private final PaymentService payments;
	private final BillingIncomeSourceService billing;

	public AccountLedgerAssetService(BankingService banking, BankingBalanceService balances,
		BankTransferPostingService transfers, PaymentService payments, BillingIncomeSourceService billing, PayableSourceService payableSources) {
		this.payableSources = payableSources;
		this.banking = banking;
		this.balances = balances;
		this.transfers = transfers;
		this.payments = payments;
		this.billing = billing;
	}

	/** 자산·부채는 수익의 복사본이 아닌 실제 통장·청구·유효 충당 원본에서 투영합니다. */
	public List<Entry> get(UUID actor, UUID property, IncomeStatementResponse source, UUID accountId, UUID buildingId) {
		List<Entry> result = new ArrayList<>();
		Map<String, Account> roles = new HashMap<>();
		source.accounts().stream().filter(account -> account.systemKey() != null)
			.forEach(account -> roles.put(account.systemKey(), account));
		boolean bank = selected(roles.get(DefaultAccount.BANK.getSystemKey()), accountId);
		boolean receivable = selected(roles.get(DefaultAccount.RECEIVABLE.getSystemKey()), accountId);
		boolean advance = selected(roles.get(DefaultAccount.ADVANCE_RECEIPT.getSystemKey()), accountId);
		// 이체는 기존 저장 구조에 systemKey가 없어 기본 enum 코드로 조회하고 실제 posting의 계정 FK를 우선합니다.
		boolean transfer = accountId == null || source.accounts().stream()
			.anyMatch(account -> account.id().equals(accountId) && account.code().equals(DefaultAccount.BANK_TRANSFER.getCode()));
		if (bank || transfer)
			appendBank(actor, property, source, buildingId, roles.get(DefaultAccount.BANK.getSystemKey()), bank, transfer, result);
		if (receivable || advance)
			appendHouseholds(actor, property, source, buildingId,
			receivable ? roles.get(DefaultAccount.RECEIVABLE.getSystemKey()) : null, advance ? roles.get(DefaultAccount.ADVANCE_RECEIPT.getSystemKey()) : null, result);
		if (receivable || (bank && buildingId != null)) {
			BankingBalanceResponse.Workspace workspace = balances.workspace(actor, property,
				source.range().startMonth(), source.range().endMonth(), null);
			if (receivable && buildingId == null)
				appendExternal(workspace, roles.get(DefaultAccount.RECEIVABLE.getSystemKey()), result);
			if (bank && buildingId != null) {
				int index = 0;
				for (BankingBalanceResponse.Entry entry : workspace.entries()) {
					if (!buildingId.equals(entry.buildingId()))
						continue;
					BigDecimal amount = new BigDecimal(entry.income()).subtract(new BigDecimal(entry.expense()));
					add(result, roles.get(DefaultAccount.BANK.getSystemKey()), "bank-building:" + entry.id() + ":" + index++, "BANK",
						entry.id(), buildingId, entry.date(), entry.time(), entry.label(), amount,
						"/banking/balances/" + buildingId + "?startMonth=" + source.range().startMonth()
							+ "&endMonth=" + source.range().endMonth());
				}
			}
		}
		Account payableAccount = roles.get(DefaultAccount.PAYABLE.getSystemKey());
		if (selected(payableAccount, accountId)) {
			for (var payable : payableSources.items(property)) {
				if (!"REGISTERED".equals(payable.status()) || (buildingId != null && !buildingId.equals(payable.buildingId())))
					continue;
				String path = "/accounting/payables/" + payable.id();
				add(result, payableAccount, "payable:" + payable.id(), "PAYABLE", payable.id(), payable.buildingId(),
					payable.date(), null, payable.name() + " 미지급 발생", new BigDecimal(payable.amount()), path);
				for (var payment : payable.payments()) {
					if (!"ACTIVE".equals(payment.status()))
						continue;
					add(result, payableAccount, "payable-payment:" + payment.id(), "PAYABLE", payable.id(), payable.buildingId(),
						payment.date(), null, payable.name() + " 지급", new BigDecimal(payment.amount()).negate(), path);
				}
			}
		}
		return result.stream().filter(entry -> entry.month().compareTo(source.range().startMonth()) >= 0
			&& entry.month().compareTo(source.range().endMonth()) <= 0).toList();
	}

	/** 미분류도 실제 입출금이며, 취소 원본·자동 상대 행은 기존 통장 서비스의 상태와 중복 방지를 따릅니다. */
	private void appendBank(UUID actor, UUID property, IncomeStatementResponse source, UUID buildingId,
		Account bankAccount, boolean bank, boolean transfer, List<Entry> result) {
		BankingResponse.Workspace workspace = banking.workspace(actor, property);
		Map<UUID, BankTransferPosting> postingById = new HashMap<>();
		if (transfer)
			transfers.all(property).stream().filter(posting -> posting.getCanceledAt() == null)
			.forEach(posting -> postingById.put(posting.getId(), posting));
		for (BankingResponse.Transaction row : workspace.rows()) {
			if ("CANCELED".equals(row.status()))
				continue;
			BigDecimal amount = new BigDecimal(row.amount());
			if ("EXPENSE".equals(row.direction()))
				amount = amount.negate();
			String name = row.memo() == null || row.memo().isBlank() ? row.payer() : row.memo();
			if (name == null || name.isBlank())
				name = amount.signum() < 0 ? "출금" : "입금";
			String path = "/banking/transactions?account=" + row.accountId()
				+ "&startDate=" + row.date() + "&endDate=" + row.date();
			if (bank && buildingId == null)
				add(result, bankAccount, "bank:" + row.id(), "BANK", row.id(), null, row.date(), row.time(), name, amount, path);
			if (!transfer || !"TRANSFER".equals(row.status()) || row.transferId() == null)
				continue;
			BankTransferPosting posting = postingById.get(row.transferId());
			// 이전 양쪽 원본 연결 방식도 같은 기본 103 ID를 재사용합니다. 새 posting은 저장된 FK가 우선합니다.
			Account transferAccount = source.accounts().stream()
				.filter(account -> posting == null ? DefaultAccount.BANK_TRANSFER.getCode().equals(account.code())
					: account.id().equals(posting.getAccountingAccountId())).findFirst().orElseThrow();
			BigDecimal selectedAmount = amount;
			if (buildingId != null) {
				selectedAmount = row.transferAllocations().stream().filter(part -> buildingId.equals(part.buildingId()))
					.map(part -> new BigDecimal(part.amount())).reduce(BigDecimal.ZERO, BigDecimal::add);
				if (amount.signum() < 0)
					selectedAmount = selectedAmount.negate();
			}
			add(result, transferAccount, "transfer:" + row.id(), "TRANSFER", row.id(), buildingId,
				row.date(), row.time(), amount.signum() < 0 ? "통장간 거래 · 출금" : "통장간 거래 · 입금", selectedAmount, path);
		}
		// 수동 입금은 통장 업로드 행이 없으므로 확정 수납에서 한 번만 보충합니다.
		if (!bank || buildingId != null)
			return;
		for (PaymentResponse.Payment payment : payments.workspace(actor, property).payments()) {
			if (!"CONFIRMED".equals(payment.status()) || payment.bankTransactionId() != null)
				continue;
			add(result, bankAccount, "bank-payment:" + payment.id(), "RECEIPT", payment.id(), null,
				payment.date(), null, payment.payer(), new BigDecimal(payment.amount()), "/banking/receipts/" + payment.id());
		}
	}

	/** 청구 당시 동·호수를 유지하고 수납·선납의 유효 충당만 미수 감소와 선수금 사용에 한 번 반영합니다. */
	private void appendHouseholds(UUID actor, UUID property, IncomeStatementResponse source, UUID buildingId,
		Account receivable, Account advance, List<Entry> result) {
		PaymentResponse.Ledger ledger = payments.workspace(actor, property);
		Map<UUID, UUID> cashBuildings = payments.cashBuildings(actor, property);
		Map<UUID, ReceivableSource> charges = new HashMap<>();
		Map<UUID, UUID> chargeBuildings = new HashMap<>();
		for (ReceivableSource charge : billing.receivables(property)) {
			charges.put(charge.id(), charge);
			UUID building = building(source, charge.buildingName());
			chargeBuildings.put(charge.id(), building);
			// 0원·음수 청구는 기존 손익의 정책 확인 목록에 남기고 미수 감소 정책을 임의로 정하지 않습니다.
			if (charge.amount().signum() <= 0 || (buildingId != null && !buildingId.equals(building)))
				continue;
			add(result, receivable, "receivable:" + charge.id(), "RECEIVABLE", charge.id(), building,
				charge.date(), null, unit(charge) + (charge.opening() ? " 초기 미수금" : " 관리비 부과"), charge.amount(),
				monthlyPath(charge));
		}
		for (PaymentResponse.Payment payment : ledger.payments()) {
			if (!"CONFIRMED".equals(payment.status()) || !"HOUSEHOLD".equals(payment.receiptType()))
				continue;
			PaymentResponse.Unit unit = ledger.units().stream().filter(value -> value.id().toString().equals(payment.unitId()))
				.findFirst().orElse(null);
			UUID building = cashBuildings.get(payment.id());
			String label = unit == null ? "세대" : unit.label();
			String path = "/banking/receipts/" + payment.id();
			if (buildingId == null || buildingId.equals(building))
				add(result, advance, "advance:" + payment.id(), "RECEIPT", payment.id(), building,
					payment.date(), null, label + " 초과 수납", remainingAtReceipt(payment.amount(), payment.date(), payment.allocations(), charges), path);
			appendApplications(result, payment.allocations(), charges, chargeBuildings, buildingId, receivable, advance,
				payment.date(), payment.id(), "payment", path);
		}
		for (PaymentResponse.OpeningCredit credit : ledger.openingCredits()) {
			PaymentResponse.Unit unit = ledger.units().stream().filter(value -> value.id().equals(credit.unitId()))
				.findFirst().orElse(null);
			UUID building = unit == null ? null : building(source, unit.buildingName());
			String path = "/billing/monthly/initial-correction";
			if (buildingId == null || buildingId.equals(building))
				add(result, advance, "opening-credit:" + credit.id(), "OPENING_CREDIT", credit.id(), building,
					credit.date(), null, (unit == null ? "세대" : unit.label()) + " 초기 선수금",
					remainingAtReceipt(credit.amount(), credit.date(), credit.allocations(), charges), path);
			appendApplications(result, credit.allocations(), charges, chargeBuildings, buildingId, receivable, advance,
				credit.date(), credit.id(), "credit", path);
		}
	}

	/** 충당일은 입금·인계일과 부과일 중 늦은 날이며 미래 청구에 쓴 선수금을 과거 입금일에 소급 소진하지 않습니다. */
	private void appendApplications(List<Entry> result, List<PaymentResponse.Allocation> allocations,
		Map<UUID, ReceivableSource> charges, Map<UUID, UUID> buildings, UUID buildingId,
		Account receivable, Account advance, LocalDate received, UUID sourceId, String prefix, String path) {
		for (PaymentResponse.Allocation allocation : allocations) {
			ReceivableSource charge = charges.get(allocation.chargeId());
			if (charge == null)
				continue;
			UUID building = buildings.get(charge.id());
			if (buildingId != null && !buildingId.equals(building))
				continue;
			LocalDate date = received.isAfter(charge.date()) ? received : charge.date();
			BigDecimal amount = new BigDecimal(allocation.amount()).negate();
			String id = prefix + ":" + sourceId + ":" + charge.id();
			String kind = "credit".equals(prefix) ? "OPENING_CREDIT" : "RECEIPT";
			add(result, receivable, "receivable-" + id, kind, sourceId, building, date, null,
				unit(charge) + " 수납 충당", amount, path);
			if (charge.date().isAfter(received))
				add(result, advance, "advance-" + id, kind, sourceId, building, date, null,
				unit(charge) + " 관리비 충당", amount, path);
		}
	}

	/** 같은 날까지의 청구에 즉시 충당한 돈은 선수금 거래로 부풀리지 않고 남은 초과액만 연결합니다. */
	private BigDecimal remainingAtReceipt(String amount, LocalDate received, List<PaymentResponse.Allocation> allocations,
		Map<UUID, ReceivableSource> charges) {
		BigDecimal used = allocations.stream().filter(part -> charges.containsKey(part.chargeId())
			&& !charges.get(part.chargeId()).date().isAfter(received))
			.map(part -> new BigDecimal(part.amount())).reduce(BigDecimal.ZERO, BigDecimal::add);
		return new BigDecimal(amount).subtract(used);
	}

	/** 정산 제외는 채권 소멸이 아니므로 외부 부담 원액과 실제 회수만 반영합니다. */
	private void appendExternal(BankingBalanceResponse.Workspace workspace, Account account, List<Entry> result) {
		for (BankingBalanceResponse.External external : workspace.externals()) {
			String path = "/banking/balances?startMonth=" + workspace.month() + "&endMonth=" + workspace.month();
			add(result, account, "external:" + external.id(), "EXTERNAL", external.id(), null, external.date(), null,
				external.label() + " 외부 부담금", new BigDecimal(external.amount()), path);
			for (BankingBalanceResponse.Recovery recovery : external.recoveries())
				add(result, account, "external-recovery:" + recovery.id(), "RECEIPT", recovery.paymentId(), null,
					recovery.date(), null, external.label() + " 외부 부담금 회수", new BigDecimal(recovery.amount()).negate(),
					"/banking/receipts/" + recovery.paymentId());
		}
	}

	private boolean selected(Account account, UUID selected) {
		return account != null && (selected == null || selected.equals(account.id()));
	}

	private UUID building(IncomeStatementResponse source, String name) {
		List<IncomeStatementResponse.Building> matches = source.buildings().stream()
			.filter(value -> value.name().equals(name)).toList();
		return matches.size() == 1 ? matches.getFirst().id() : null;
	}

	private String unit(ReceivableSource charge) {
		return (charge.buildingName().isBlank() ? "" : charge.buildingName() + " ") + charge.unitNumber() + "호";
	}

	private String monthlyPath(ReceivableSource charge) {
		String month = YearMonth.from(charge.date()).toString();
		return "/banking/monthly/" + month + "/" + charge.unitId() + "?month=" + month;
	}

	/** 부호는 해당 과목의 증가·감소이며 손익 합계로 합산하지 않습니다. 0원 이동은 행을 만들지 않습니다. */
	private void add(List<Entry> result, Account account, String key, String kind, UUID id, UUID building,
		LocalDate date, LocalTime time, String name, BigDecimal amount, String path) {
		if (account == null || amount.signum() == 0)
			return;
		if (name == null || name.isBlank())
			name = account.name();
		result.add(new Entry(key, account.id(), account.name(), account.group(), YearMonth.from(date).toString(),
			building, amount.toPlainString(), new Source(kind, id, date, time, name, "", path)));
	}
}
