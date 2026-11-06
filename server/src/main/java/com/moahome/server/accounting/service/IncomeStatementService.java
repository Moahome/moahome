package com.moahome.server.accounting.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.Set;
import java.util.TreeSet;
import java.util.Comparator;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import com.moahome.server.accounting.domain.AccountingAccount;
import com.moahome.server.accounting.domain.AccountingProfile;
import com.moahome.server.accounting.domain.DefaultAccount;
import com.moahome.server.accounting.domain.ExpenseAccountingReview;
import com.moahome.server.accounting.domain.RevenueAccountingReview;
import com.moahome.server.accounting.dto.IncomeStatementResponse;
import com.moahome.server.accounting.dto.IncomeStatementResponse.Entry;
import com.moahome.server.accounting.dto.IncomeStatementResponse.Issue;
import com.moahome.server.accounting.exception.AccountingException;
import com.moahome.server.accounting.repo.AccountingAccountRepository;
import com.moahome.server.accounting.repo.AccountingProfileRepository;
import com.moahome.server.accounting.repo.ExpenseAccountingReviewRepository;
import com.moahome.server.accounting.repo.RevenueAccountingReviewRepository;
import com.moahome.server.banking.dto.BankingResponse;
import com.moahome.server.banking.service.BankingService;
import com.moahome.server.banking.service.BankingBalanceService;
import com.moahome.server.banking.dto.BankingBalanceResponse;
import com.moahome.server.billing.domain.BillingCalendar;
import com.moahome.server.billing.domain.FeeItemCode;
import com.moahome.server.billing.dto.BillingIncomeSource;
import com.moahome.server.billing.service.BillingIncomeSourceService;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.domain.Building;
import com.moahome.server.property.domain.Property;
import com.moahome.server.property.repo.BuildingRepository;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.property.service.ManagementAccessService;

@Service
public class IncomeStatementService {
	private final ManagementAccessService access;

	private final PropertyRepository properties;
	private final BuildingRepository buildings;

	private final AccountingProfileRepository profiles;
	private final AccountingAccountRepository accounts;

	private final ExpenseAccountingReviewRepository reviews;
	private final RevenueAccountingReviewRepository revenueReviews;

	private final BillingIncomeSourceService billing;
	private final BankingService banking;
	private final BankingBalanceService bankingBalances;

	private final Clock clock;

	public IncomeStatementService(ManagementAccessService access, PropertyRepository properties,
		BuildingRepository buildings, AccountingProfileRepository profiles, AccountingAccountRepository accounts,
		ExpenseAccountingReviewRepository reviews, RevenueAccountingReviewRepository revenueReviews,
		BillingIncomeSourceService billing, BankingService banking, BankingBalanceService bankingBalances,
		Clock clock) {
		this.access = access;
		this.properties = properties;
		this.buildings = buildings;
		this.profiles = profiles;
		this.accounts = accounts;
		this.reviews = reviews;
		this.revenueReviews = revenueReviews;
		this.billing = billing;
		this.banking = banking;
		this.bankingBalances = bankingBalances;
		this.clock = clock;
	}

	/** 같은 읽기 스냅샷에서 확정 부과와 확인한 지출을 조회하며 수납·인계·내부 이체를 수익으로 재계산하지 않습니다. */
	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	public IncomeStatementResponse get(UUID actor, UUID propertyId, String rawStart, String rawEnd, UUID buildingId) {
		var context = access.getManagementContext(actor, propertyId);
		YearMonth start = rawStart == null && rawEnd == null ? BillingCalendar.currentMonth(clock)
			: BillingCalendar.parseMonth(rawStart);
		YearMonth end = rawStart == null && rawEnd == null ? start : BillingCalendar.parseMonth(rawEnd);
		if (start.isAfter(end) || ChronoUnit.MONTHS.between(start, end) >= 120)
			throw new AccountingException("INVALID_ACCOUNTING_PERIOD");
		Property property = properties.findById(propertyId).orElseThrow();
		List<Building> sourceBuildings = buildings.findByPropertyId(propertyId);
		if (buildingId != null && sourceBuildings.stream().noneMatch(value -> value.getId().equals(buildingId)))
			throw new AccountingException("INVALID_ACCOUNTING_BUILDING");
		AccountingProfile profile = profiles.findById(propertyId).orElse(null);
		List<AccountingAccount> sourceAccounts = accounts.findByPropertyIdOrderByCreatedAtAscIdAsc(propertyId);
		List<Entry> records = new ArrayList<>();
		List<Issue> issues = new ArrayList<>();
		List<IncomeStatementResponse.Expense> expenseRows = new ArrayList<>();
		List<IncomeStatementResponse.RevenueItem> revenueItems = new ArrayList<>();
		List<IncomeStatementResponse.Receivable> receivables = new ArrayList<>();
		List<IncomeStatementResponse.OtherIncome> otherIncomes = new ArrayList<>();
		String completeness = "SETUP_REQUIRED";
		if (profile != null) {
			completeness = start.atDay(1).isBefore(profile.getStartMonth()) ? "BEFORE_START" : "READY";
			if ("READY".equals(completeness)) {
				AccountingAccount revenueAccount = sourceAccounts.stream()
					.filter(account -> "MANAGEMENT_REVENUE".equals(account.getSystemKey())).findFirst()
					.orElseThrow(() -> new IllegalStateException("Missing management revenue account"));
				appendBilling(property, sourceBuildings, revenueAccount, start, end, buildingId, records, issues, revenueItems);
				Map<UUID, BigDecimal> recoveries = appendReceivables(actor, property, sourceAccounts, start, end, receivables);
				appendExpenses(actor, property, sourceAccounts, start, end, buildingId, records, issues, expenseRows, recoveries,
					otherIncomes);
				if (!issues.isEmpty())
					completeness = "REVIEW_REQUIRED";
			}
		}
		return new IncomeStatementResponse(propertyId, context.name(), OffsetDateTime.now(clock),
			new IncomeStatementResponse.Range(start.toString(), end.toString()), profile == null ? null
				: new IncomeStatementResponse.Configuration(YearMonth.from(profile.getStartMonth()).toString(),
					profile.getFiscalYearStartMonth()), context.role() == PropertyMemberRole.ADMIN, completeness,
			sourceBuildings.stream().map(value -> new IncomeStatementResponse.Building(value.getId(), value.getName(),
				value.getDeletedAt() != null))
				.toList(), sourceAccounts.stream().sorted(Comparator.comparing(AccountingAccount::getCode))
				.map(account -> new IncomeStatementResponse.Account(account.getId(),
					account.getCode(), account.getName(), group(account), account.getSystemKey())).toList(),
			List.copyOf(records), List.copyOf(issues), List.copyOf(expenseRows), List.copyOf(revenueItems), List.copyOf(receivables),
			List.copyOf(otherIncomes));
	}

	/** 표준 관리비는 기본 수익으로 자동 연결하고 원본 항목·부과월과 명시적 분류 이력은 유지합니다. */
	private void appendBilling(Property property, List<Building> sourceBuildings, AccountingAccount account,
		YearMonth start, YearMonth end, UUID buildingId, List<Entry> records, List<Issue> issues,
		List<IncomeStatementResponse.RevenueItem> revenueItems) {
		Map<UUID, RevenueAccountingReview> latest = new HashMap<>();
		for (RevenueAccountingReview review : revenueReviews.findByPropertyIdOrderByRevisionDesc(property.getId()))
			latest.putIfAbsent(review.getSourceTemplateItemId(), review);
		Map<UUID, IncomeStatementResponse.RevenueItem> candidates = new LinkedHashMap<>();
		Map<UUID, Set<String>> sourceMonths = new HashMap<>();
		for (BillingIncomeSource source : billing.get(property.getId())) {
			if (!within(source.month(), start, end))
				continue;
			List<Building> matching = sourceBuildings.stream()
				.filter(building -> building.getName().equals(source.buildingName())).toList();
			UUID target = matching.size() == 1 ? matching.getFirst().getId() : null;
			String path = "/banking/monthly/" + source.month() + "/" + source.unitId() + "?month=" + source.month();
			if (property.isHasBuildings() && target == null) {
				issues.add(new Issue("charge:" + source.chargeId(), "BUILDING_ATTRIBUTION_REQUIRED",
					"부과 당시 동을 현재 동 정보와 연결할 수 없습니다.", source.amount().toPlainString(), path, null,
					null, "관리비 부과", billingContext(source)));
				continue;
			}
			if (buildingId != null && !buildingId.equals(target))
				continue;
			BigDecimal itemTotal = source.items().stream().map(BillingIncomeSource.Item::amount)
				.reduce(BigDecimal.ZERO, BigDecimal::add);
			if (source.amount().signum() <= 0 || source.items().stream().anyMatch(item -> item.amount().signum() < 0)) {
				issues.add(new Issue("charge:" + source.chargeId(), "CHARGE_POLICY_REVIEW_REQUIRED",
					"0원·음수 청구의 회계 처리 확인 필요", source.amount().toPlainString(), path, null,
					null, "관리비 부과", billingContext(source)));
				continue;
			}
			if (source.items().isEmpty() || itemTotal.compareTo(source.amount()) != 0) {
				issues.add(new Issue("charge:" + source.chargeId(), "CHARGE_ITEMS_REVIEW_REQUIRED",
					"부과 항목과 청구액 확인 필요", source.amount().toPlainString(), path, null,
					null, "관리비 부과", billingContext(source)));
				continue;
			}
			for (BillingIncomeSource.Item item : source.items()) {
				if (item.amount().signum() == 0)
					continue;
				RevenueAccountingReview review = latest.get(item.sourceTemplateItemId());
				// 기존 자료의 명칭 표기도 같은 기본 계정으로 연결하며 수납을 새 수익으로 만들지 않습니다.
				boolean recognized = review == null ? (account.getId().equals(item.revenueAccountId())
					|| item.code() == FeeItemCode.GENERAL_MANAGEMENT
					|| Set.of("일반관리비", "관리비", "관리비수입", "관리비수익").contains(item.name().replaceAll("(?U)\\s+", "")))
					: review.isRecognized();
				sourceMonths.computeIfAbsent(item.sourceTemplateItemId(), key -> new TreeSet<>()).add(source.month());
				IncomeStatementResponse.RevenueItem previous = candidates.get(item.sourceTemplateItemId());
				BigDecimal amount = item.amount().add(previous == null ? BigDecimal.ZERO : new BigDecimal(previous.amount()));
				candidates.put(item.sourceTemplateItemId(), new IncomeStatementResponse.RevenueItem(item.sourceTemplateItemId(),
					item.name(), amount.toPlainString(), recognized, review == null ? 0 : review.getRevision(), null));
				if (!recognized) {
					continue;
				}
				records.add(new Entry("charge:" + item.id(), account.getId(), account.getName(), group(account),
					source.month(), target, item.amount().toPlainString()));
			}
		}
		for (var item : candidates.values())
			revenueItems.add(new IncomeStatementResponse.RevenueItem(item.id(), item.name(), item.amount(), item.recognized(),
				item.revision(), String.join(", ", sourceMonths.get(item.id())) + " 부과 합계"));
		for (IncomeStatementResponse.RevenueItem item : revenueItems) {
			if (!item.recognized())
				issues.add(new Issue("revenue:" + item.id(), "REVENUE_CLASSIFICATION_REQUIRED",
					item.name() + " 수익 계정 확인 필요", item.amount(),
					"/billing/monthly?month=" + start, null, item.id(), item.name(), start + " ~ " + end + " 부과 합계"));
		}
	}

	/** 별도 월 입력 없이 지출 날짜로 귀속하고, 이미 저장된 명시적 귀속 이력은 그대로 보존합니다. */
	private void appendExpenses(UUID actor, Property property, List<AccountingAccount> sourceAccounts,
		YearMonth start, YearMonth end, UUID buildingId, List<Entry> records, List<Issue> issues,
		List<IncomeStatementResponse.Expense> expenseRows, Map<UUID, BigDecimal> recoveries,
		List<IncomeStatementResponse.OtherIncome> otherIncomes) {
		Map<UUID, AccountingAccount> byAccount = sourceAccounts.stream()
			.collect(Collectors.toMap(AccountingAccount::getId, Function.identity()));
		Map<UUID, ExpenseAccountingReview> latest = new HashMap<>();
		for (ExpenseAccountingReview review : reviews.findByPropertyIdOrderByRevisionDesc(property.getId()))
			latest.putIfAbsent(review.getExpenseId(), review);
		for (BankingResponse.Transaction row : banking.workspace(actor, property.getId()).rows()) {
			// 입금은 수납 상세 ID로 연결합니다. 연결이 없는 원본을 출금 상세로 오인하지 않습니다.
			String path = "INCOME".equals(row.direction())
				? (row.paymentId() == null ? "/banking/transactions" : "/banking/receipts/" + row.paymentId())
				: "/banking/transactions/" + row.id();
			if ("PENDING".equals(row.status()) || "HOLD".equals(row.status())) {
				if (within(YearMonth.from(row.date()).toString(), start, end))
					issues.add(new Issue("transaction:" + row.id(), "TRANSACTION_CLASSIFICATION_REQUIRED",
						"미분류·보류 거래 확인 필요", row.amount(), path, null, null,
						transactionName(row), transactionContext(row)));
				continue;
			}
			if ("INCOME".equals(row.direction()) && "CONFIRMED".equals(row.status())
				&& !"HOUSEHOLD".equals(row.receiptType())
				&& within(YearMonth.from(row.date()).toString(), start, end)) {
				// 실제 회수 연결액은 102 미수금 감소이며 입금의 나머지 금액만 별도 분류 대상으로 남깁니다.
				BigDecimal unclassified = new BigDecimal(row.amount())
					.subtract(recoveries.getOrDefault(row.paymentId(), BigDecimal.ZERO));
				if (unclassified.signum() > 0)
					appendOtherIncome(property, sourceAccounts, row, unclassified, buildingId, records, issues, otherIncomes);
			}
			if (!"EXPENSE".equals(row.direction()) || !"CONFIRMED".equals(row.status()) || row.expense() == null)
				continue;
			BankingResponse.Expense expense = row.expense();
			ExpenseAccountingReview review = latest.get(expense.id());
			String month = (review == null ? YearMonth.from(row.date())
				: YearMonth.from(review.getRecognitionMonth())).toString();
			if (!within(month, start, end))
				continue;
			AccountingAccount account = review == null ? sourceAccounts.stream()
				.filter(value -> value.getCode().equals(expense.accountCode()) && value.getReportGroup().isExpense())
				.findFirst().orElseGet(() -> ExpenseAccountService.match(expense.category(), sourceAccounts))
				: byAccount.get(review.getAccountId());
			BigDecimal ownAmount = property.isHasBuildings() ? expense.allocations().stream()
				.filter(allocation -> allocation.buildingId() != null)
				.map(allocation -> new BigDecimal(allocation.amount())).reduce(BigDecimal.ZERO, BigDecimal::add)
				: new BigDecimal(row.amount());
			if (buildingId != null && expense.allocations().stream()
				.noneMatch(allocation -> buildingId.equals(allocation.buildingId())))
				continue;
			if (ownAmount.signum() == 0)
				continue;
			if (account == null)
				issues.add(new Issue("expense:" + expense.id(), "EXPENSE_ACCOUNTING_REVIEW_REQUIRED",
					expense.category() + " 과목 확인 필요", ownAmount.toPlainString(), path,
					expense.id(), null, expense.category(), transactionContext(row)));
			expenseRows.add(new IncomeStatementResponse.Expense(expense.id(), row.id(), row.date(), expense.category(),
				ownAmount.toPlainString(), account == null ? null : account.getId(), month,
				review == null ? 0 : review.getRevision()));
			if (account == null)
				continue;
			if (!account.getReportGroup().isExpense())
				throw new IllegalStateException("Invalid expense account");
			if (!property.isHasBuildings()) {
				records.add(new Entry("expense:" + expense.id(), account.getId(), account.getName(), group(account),
					month, null, row.amount()));
				continue;
			}
			for (BankingResponse.Allocation allocation : expense.allocations()) {
				if (allocation.buildingId() != null && (buildingId == null || buildingId.equals(allocation.buildingId())))
					records.add(new Entry("expense:" + expense.id() + ":" + allocation.buildingId(), account.getId(),
						account.getName(), group(account), month, allocation.buildingId(), allocation.amount()));
			}
		}
	}

	/** 실제 회수액을 제외한 기타 입금은 901로 자동 연결하고 저장된 동 배분만 손익에 사용합니다. */
	private void appendOtherIncome(Property property, List<AccountingAccount> sourceAccounts,
		BankingResponse.Transaction row, BigDecimal amount, UUID buildingId, List<Entry> records, List<Issue> issues,
		List<IncomeStatementResponse.OtherIncome> otherIncomes) {
		AccountingAccount account = sourceAccounts.stream().filter(value -> "OTHER_INCOME".equals(value.getSystemKey()))
			.findFirst().orElseThrow(() -> new IllegalStateException("Missing other income account"));
		String month = YearMonth.from(row.date()).toString();
		if (!property.isHasBuildings()) {
			records.add(new Entry("income:" + row.paymentId(), account.getId(), account.getName(), group(account),
				month, null, amount.toPlainString()));
			otherIncomes.add(new IncomeStatementResponse.OtherIncome(row.paymentId(), row.id(), row.date(),
				transactionName(row), amount.toPlainString(), account.getId()));
			return;
		}
		BankingResponse.Expense allocation = row.incomeAllocation();
		if (allocation == null) {
			if (buildingId == null)
				issues.add(new Issue("income:" + row.id(), "OTHER_INCOME_BUILDING_REQUIRED",
					"901 영업외수익 · 귀속 동 확인 필요", amount.toPlainString(),
					"/banking/receipts/" + row.paymentId(), null, null, transactionName(row), transactionContext(row)));
			return;
		}
		// 회수에 사용한 입금은 동별 배분과 중복 연결할 수 없으므로 저장된 전체 배분 합계를 대조합니다.
		BigDecimal total = allocation.allocations().stream().map(value -> new BigDecimal(value.amount()))
			.reduce(BigDecimal.ZERO, BigDecimal::add);
		if (total.compareTo(amount) != 0)
			throw new IllegalStateException("Other income allocation mismatch");
		BigDecimal selected = BigDecimal.ZERO;
		for (BankingResponse.Allocation part : allocation.allocations()) {
			if (part.buildingId() != null && (buildingId == null || buildingId.equals(part.buildingId()))) {
				records.add(new Entry("income:" + row.paymentId() + ":" + part.buildingId(), account.getId(),
					account.getName(), group(account), month, part.buildingId(), part.amount()));
				selected = selected.add(new BigDecimal(part.amount()));
			}
		}
		if (selected.signum() > 0)
			otherIncomes.add(new IncomeStatementResponse.OtherIncome(row.paymentId(), row.id(), row.date(),
				transactionName(row), selected.toPlainString(), account.getId()));
	}


	/** 외부 부담은 기존 회수 원장과 대조해 미수금으로 표시하고 실제 회수만 잔액에서 차감합니다. */
	private Map<UUID, BigDecimal> appendReceivables(UUID actor, Property property, List<AccountingAccount> sourceAccounts,
		YearMonth start, YearMonth end, List<IncomeStatementResponse.Receivable> receivables) {
		if (!property.isHasBuildings())
			return Map.of();
		List<BankingBalanceResponse.External> external = bankingBalances.workspace(actor, property.getId(), end.toString(), null).externals();
		if (external.isEmpty())
			return Map.of();
		AccountingAccount account = sourceAccounts.stream().filter(value -> "RECEIVABLE".equals(value.getSystemKey()))
			.findFirst().orElseThrow(() -> new IllegalStateException("Missing receivable account"));
		Map<UUID, BigDecimal> recoveries = new HashMap<>();
		for (BankingBalanceResponse.External row : external) {
			String path = row.transactionId() == null ? "/banking/balances?month=" + end
				: "/banking/transactions/" + row.transactionId();
			if (within(YearMonth.from(row.date()).toString(), start, end))
				receivables.add(new IncomeStatementResponse.Receivable(row.id(), account.getCode(), row.expenseName(), row.date(),
					row.label(), row.amount(), row.received(), row.remaining(), path));
			// 발생 월이 조회 밖이어도 당기 회수 입금은 수익으로 중복 인식하지 않도록 대조에 남깁니다.
			for (BankingBalanceResponse.Recovery recovery : row.recoveries())
				recoveries.merge(recovery.paymentId(), new BigDecimal(recovery.amount()), BigDecimal::add);
		}
		return recoveries;
	}

	/** 현재 세대 정보로 과거 귀속을 추정하지 않고 청구 당시 동·호수·표시명으로 원본을 구분합니다. */
	private String billingContext(BillingIncomeSource source) {
		List<String> parts = new ArrayList<>();
		parts.add(source.month() + " 부과");
		parts.add(source.buildingName() == null || source.buildingName().isBlank() ? "동 정보 없음" : source.buildingName());
		if (source.unitNumber() != null && !source.unitNumber().isBlank())
			parts.add(source.unitNumber() + "호");
		if (source.displayName() != null && !source.displayName().isBlank())
			parts.add(source.displayName());
		return String.join(" · ", parts);
	}

	/** 지출명·적요가 비어 있어도 입출금 방향을 표시하며 확인 사유를 거래 이름으로 대신하지 않습니다. */
	private String transactionName(BankingResponse.Transaction row) {
		if (row.expense() != null)
			return row.expense().category();
		if (row.memo() != null && !row.memo().isBlank())
			return row.memo();
		return "INCOME".equals(row.direction()) ? "입금" : "출금";
	}

	/** 거래일과 기존 부담처 표시만 전달하며 부담 배분을 회계 채권의 확정 근거로 해석하지 않습니다. */
	private String transactionContext(BankingResponse.Transaction row) {
		List<String> parts = new ArrayList<>();
		parts.add("거래일 " + row.date());
		if (row.payer() != null && !row.payer().isBlank())
			parts.add(row.payer());
		if (row.unitLabel() != null && !row.unitLabel().isBlank())
			parts.add(row.unitLabel());
		if (row.expense() != null) {
			String targets = row.expense().allocations().stream().map(BankingResponse.Allocation::label)
				.filter(label -> label != null && !label.isBlank()).distinct().collect(Collectors.joining(", "));
			if (!targets.isBlank())
				parts.add("부담처 " + targets);
		}
		return String.join(" · ", parts);
	}

	private boolean within(String month, YearMonth start, YearMonth end) {
		return month.compareTo(start.toString()) >= 0 && month.compareTo(end.toString()) <= 0;
	}

	private String group(AccountingAccount account) {
		return switch (account.getReportGroup()) {
			case ASSET -> "asset";
			case LIABILITY -> "liability";
			case OPERATING_REVENUE -> "operatingRevenue";
			case OPERATING_EXPENSE -> "operatingExpense";
			case OTHER_REVENUE -> "otherRevenue";
			case OTHER_EXPENSE -> "otherExpense";
		};
	}
}
