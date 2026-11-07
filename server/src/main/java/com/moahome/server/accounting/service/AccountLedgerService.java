package com.moahome.server.accounting.service;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.time.YearMonth;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import com.moahome.server.accounting.dto.AccountLedgerResponse;
import com.moahome.server.accounting.dto.IncomeStatementResponse;
import com.moahome.server.accounting.dto.IncomeStatementResponse.Entry;
import com.moahome.server.accounting.dto.IncomeStatementResponse.Source;
import com.moahome.server.accounting.exception.AccountingException;

@Service
public class AccountLedgerService {
	private static final Pattern NATURAL_PART = Pattern.compile("\\d+|\\D+");
	private final IncomeStatementService income;
	private final AccountLedgerAssetService assets;
	private final AccountLedgerBankService bank;

	public AccountLedgerService(IncomeStatementService income, AccountLedgerAssetService assets, AccountLedgerBankService bank) {
		this.income = income;
		this.assets = assets;
		this.bank = bank;
	}

	/** 기존 권한·기간·분류 기준을 재사용하고 페이지 구분 전 전체 원천으로 과목별 기간 누계를 계산합니다. */
	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	public AccountLedgerResponse get(UUID actor, UUID propertyId, String startMonth, String endMonth,
		UUID buildingId, UUID accountId) {
		return getSelected(actor, propertyId, startMonth, endMonth, buildingId,
			accountId == null ? List.of() : List.of(accountId));
	}

	/** 선택 과목을 같은 관리대상에서 검증하고 합집합으로 조회하되 누계는 과목별로 분리합니다. */
	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	public AccountLedgerResponse getSelected(UUID actor, UUID propertyId, String startMonth, String endMonth,
		UUID buildingId, List<UUID> accountIds) {
		return getSelected(actor, propertyId, startMonth, endMonth, buildingId, accountIds, null);
	}

	/** 101 단독 조회의 실제 계좌 조건은 관리대상·조회 기간의 통장 목록에서 검증합니다. */
	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	public AccountLedgerResponse getSelected(UUID actor, UUID propertyId, String startMonth, String endMonth,
		UUID buildingId, List<UUID> accountIds, UUID bankAccountId) {
		Set<UUID> selectedIds = new HashSet<>(accountIds);
		IncomeStatementResponse source = income.get(actor, propertyId, startMonth, endMonth, buildingId);
		if (!source.accounts().stream().map(IncomeStatementResponse.Account::id).toList().containsAll(selectedIds))
			throw new AccountingException("INVALID_ACCOUNTING_ACCOUNT");
		UUID accountId = selectedIds.size() == 1 ? selectedIds.iterator().next() : null;
		// 등록·지급 원본이 연결된 202를 포함하며 기초/기말 잔액과 기간 증감 누계는 구분합니다.
		boolean supported = true;
		List<Entry> all = new ArrayList<>(source.records());
		if (supported && List.of("READY", "REVIEW_REQUIRED").contains(source.completeness()))
			all.addAll(assets.get(actor, propertyId, source, accountId, buildingId));
		var bankAccount = source.accounts().stream().filter(value -> "BANK".equals(value.systemKey())).findFirst().orElse(null);
		AccountLedgerBankService.Projection bankData = new AccountLedgerBankService.Projection(List.of(), List.of(), Map.of());
		if (bankAccount != null && (selectedIds.isEmpty() || selectedIds.contains(bankAccount.id()))
			&& List.of("READY", "REVIEW_REQUIRED").contains(source.completeness())) {
			bankData = bank.get(actor, propertyId, source, buildingId);
			all.removeIf(entry -> bankAccount.id().equals(entry.accountId()));
			all.addAll(bankData.entries());
		}
		if (bankAccountId != null) {
			if (bankAccount == null || !bankAccount.id().equals(accountId)
				|| bankData.balances().stream().noneMatch(value -> bankAccountId.equals(value.accountId())))
				throw new AccountingException("INVALID_ACCOUNTING_ACCOUNT");
			Map<String, AccountLedgerResponse.CashBalance> cash = bankData.cash();
			all.removeIf(entry -> !cash.containsKey(entry.id()) || !bankAccountId.equals(cash.get(entry.id()).bankAccountId()));
		}
		List<Entry> filtered = all.stream()
			.filter(entry -> supported && (selectedIds.isEmpty() || selectedIds.contains(entry.accountId()))).toList();
		Map<String, List<Entry>> billingGroups = new LinkedHashMap<>();
		List<Entry> displayEntries = new ArrayList<>();
		Map<String, List<String>> sourceIds = new HashMap<>();
		// 부과 수익은 세대별 미납 행이 아닌 월·과목별 부과 합계로 표시하고 구성 항목 ID를 보존합니다.
		for (Entry entry : filtered) {
			if (entry.source() != null && "CHARGE".equals(entry.source().kind())) {
				String key = "billing:" + entry.month() + ":" + entry.accountId();
				billingGroups.computeIfAbsent(key, ignored -> new ArrayList<>()).add(entry);
				continue;
			}
			displayEntries.add(entry);
			sourceIds.put(entry.id(), List.of(entry.id()));
		}
		for (Map.Entry<String, List<Entry>> group : billingGroups.entrySet()) {
			List<Entry> members = group.getValue();
			Entry first = members.getFirst();
			BigDecimal amount = members.stream().map(entry -> new BigDecimal(entry.amount()))
				.reduce(BigDecimal.ZERO, BigDecimal::add);
			List<String> names = members.stream().map(entry -> entry.source().name()).distinct().toList();
			String name = names.size() == 1 ? names.getFirst() : first.accountName();
			// 같은 부과월의 저장된 부과일을 사용하며 생성·확정 처리 시각을 부과일로 대신하지 않습니다.
			Source billingSource = new Source("BILLING", null, first.source().date(), null, name,
				first.month() + " 부과 합계", "/billing/monthly/history/" + first.month());
			displayEntries.add(new Entry(group.getKey(), first.accountId(), first.accountName(), first.group(),
				first.month(), buildingId, amount.toPlainString(), billingSource));
			sourceIds.put(group.getKey(), members.stream().map(Entry::id).sorted().toList());
		}
		List<Entry> entries = displayEntries.stream()
			.sorted(Comparator.comparing((Entry entry) -> entry.source() == null || entry.source().date() == null
					? YearMonth.parse(entry.month()).atDay(1) : entry.source().date())
				.thenComparing(entry -> entry.source() == null || entry.source().time() == null
					? LocalTime.MIN : entry.source().time())
				.thenComparing(Entry::month)
				.thenComparingInt(entry -> new BigDecimal(entry.amount()).signum() < 0 ? 1 : 0)
				.thenComparing(this::compareSourceNames)
				.thenComparing(Entry::id)).toList();
		Map<UUID, BigDecimal> cumulative = new HashMap<>();
		List<AccountLedgerResponse.Row> rows = new ArrayList<>();
		BigDecimal revenue = BigDecimal.ZERO;
		BigDecimal expense = BigDecimal.ZERO;
		List<AccountLedgerResponse.BankBalance> scopedBanks = bankData.balances().stream()
			.filter(value -> bankAccountId == null || bankAccountId.equals(value.accountId())).toList();
		BigDecimal cashRunning = scopedBanks.isEmpty() || scopedBanks.stream().anyMatch(value -> value.openingBalance() == null)
			? null : scopedBanks.stream().map(value -> new BigDecimal(value.openingBalance())).reduce(BigDecimal.ZERO, BigDecimal::add);
		Map<UUID, BigDecimal> transferAmounts = new HashMap<>();
		Set<UUID> appliedTransfers = new HashSet<>();
		for (Entry entry : entries) {
			UUID transfer = bankData.transferGroups().get(entry.id());
			if (transfer != null) transferAmounts.merge(transfer, new BigDecimal(entry.amount()), BigDecimal::add);
		}
		for (Entry entry : entries) {
			if (entry.source() == null) {
				throw new IllegalStateException("Missing accounting source");
			}
			BigDecimal amount = new BigDecimal(entry.amount());
			BigDecimal total = cumulative.merge(entry.accountId(), amount, BigDecimal::add);
			var cash = bankData.cash().get(entry.id());
			if (cash != null) {
				// 전체 계좌는 101의 기초 합계부터 누적합니다. 내부 이체 양쪽은 한 사건으로 계산해 합계를 늘리지 않습니다.
				UUID transfer = bankData.transferGroups().get(entry.id());
				BigDecimal movement = transfer == null ? amount
					: appliedTransfers.add(transfer) ? transferAmounts.get(transfer) : BigDecimal.ZERO;
				if (cashRunning != null) cashRunning = cashRunning.add(movement);
				cash = new AccountLedgerResponse.CashBalance(cash.bankAccountId(), cash.bankAccountName(),
					cashRunning == null ? null : cashRunning.toPlainString(), cash.reportedBalance());
			}
			rows.add(new AccountLedgerResponse.Row(entry, total.toPlainString(), sourceIds.get(entry.id()), cash));
			if (entry.group().endsWith("Revenue")) {
				revenue = revenue.add(amount);
			} else if (entry.group().endsWith("Expense")) {
				expense = expense.add(amount);
			}
		}
		// API는 계산 기준의 정확한 역순을 반환합니다. Client 기본 과목순은 이 순서를 뒤집어 그대로 재사용합니다.
		Collections.reverse(rows);
		return new AccountLedgerResponse(source.propertyId(), source.propertyName(), source.generatedAt(),
			source.range(), source.configuration(), source.completeness(), supported, source.canManage(), accountId, selectedIds.stream().sorted().toList(), buildingId, bankAccountId,
			source.buildings(), source.accounts(), bankData.balances(), List.copyOf(rows), source.issues(), revenue.toPlainString(),
			expense.toPlainString());
	}

	/** 같은 날짜에는 증가 후 감소, 동·호수의 숫자순을 누계 계산과 표시에서 함께 사용합니다. */
	private int compareSourceNames(Entry left, Entry right) {
		Matcher a = NATURAL_PART.matcher(left.source().name());
		Matcher b = NATURAL_PART.matcher(right.source().name());
		while (a.find() && b.find()) {
			String leftPart = a.group();
			String rightPart = b.group();
			int compared = leftPart.charAt(0) >= '0' && leftPart.charAt(0) <= '9'
				&& rightPart.charAt(0) >= '0' && rightPart.charAt(0) <= '9'
				? new BigInteger(leftPart).compareTo(new BigInteger(rightPart)) : leftPart.compareTo(rightPart);
			if (compared != 0)
				return compared;
		}
		return Integer.compare(left.source().name().length(), right.source().name().length());
	}

}
