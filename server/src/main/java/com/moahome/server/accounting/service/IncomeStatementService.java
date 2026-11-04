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
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import com.moahome.server.accounting.domain.AccountingAccount;
import com.moahome.server.accounting.domain.AccountingProfile;
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
import com.moahome.server.billing.domain.BillingCalendar;
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

	private final Clock clock;

	public IncomeStatementService(ManagementAccessService access, PropertyRepository properties,
		BuildingRepository buildings, AccountingProfileRepository profiles, AccountingAccountRepository accounts,
		ExpenseAccountingReviewRepository reviews, RevenueAccountingReviewRepository revenueReviews,
		BillingIncomeSourceService billing, BankingService banking,
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
		String completeness = "SETUP_REQUIRED";
		if (profile != null) {
			completeness = start.atDay(1).isBefore(profile.getStartMonth()) ? "BEFORE_START" : "READY";
			if ("READY".equals(completeness)) {
				AccountingAccount revenueAccount = sourceAccounts.stream()
					.filter(account -> "MANAGEMENT_REVENUE".equals(account.getSystemKey())).findFirst()
					.orElseThrow(() -> new IllegalStateException("Missing management revenue account"));
				appendBilling(property, sourceBuildings, revenueAccount, start, end, buildingId, records, issues, revenueItems);
				appendExpenses(actor, property, sourceAccounts, start, end, buildingId, records, issues, expenseRows);
				if (!issues.isEmpty())
					completeness = "REVIEW_REQUIRED";
			}
		}
		return new IncomeStatementResponse(propertyId, context.name(), OffsetDateTime.now(clock),
			new IncomeStatementResponse.Range(start.toString(), end.toString()), profile == null ? null
				: new IncomeStatementResponse.Configuration(YearMonth.from(profile.getStartMonth()).toString(),
					profile.getFiscalYearStartMonth()), context.role() == PropertyMemberRole.ADMIN, completeness,
			sourceBuildings.stream().map(value -> new IncomeStatementResponse.Building(value.getId(), value.getName()))
				.toList(), sourceAccounts.stream().map(account -> new IncomeStatementResponse.Account(account.getId(),
					account.getName(), group(account), account.getSystemKey())).toList(),
			List.copyOf(records), List.copyOf(issues), List.copyOf(expenseRows), List.copyOf(revenueItems));
	}

	/** 확인한 동일 부과 항목 ID만 통합 수익으로 연결하고 예치·적립·음수 등 미확인 항목은 따로 드러냅니다. */
	private void appendBilling(Property property, List<Building> sourceBuildings, AccountingAccount account,
		YearMonth start, YearMonth end, UUID buildingId, List<Entry> records, List<Issue> issues,
		List<IncomeStatementResponse.RevenueItem> revenueItems) {
		Map<UUID, RevenueAccountingReview> latest = new HashMap<>();
		for (RevenueAccountingReview review : revenueReviews.findByPropertyIdOrderByRevisionDesc(property.getId()))
			latest.putIfAbsent(review.getSourceTemplateItemId(), review);
		Map<UUID, IncomeStatementResponse.RevenueItem> candidates = new LinkedHashMap<>();
		for (BillingIncomeSource source : billing.get(property.getId())) {
			if (!within(source.month(), start, end))
				continue;
			List<Building> matching = sourceBuildings.stream()
				.filter(building -> building.getName().equals(source.buildingName())).toList();
			UUID target = matching.size() == 1 ? matching.getFirst().getId() : null;
			String path = "/banking/monthly/" + source.month() + "/" + source.unitId() + "?month=" + source.month();
			if (property.isHasBuildings() && target == null) {
				issues.add(new Issue("charge:" + source.chargeId(), "BUILDING_ATTRIBUTION_REQUIRED",
					"과거 부과의 귀속 동 확인 필요", source.amount().toPlainString(), path, null));
				continue;
			}
			if (buildingId != null && !buildingId.equals(target))
				continue;
			BigDecimal itemTotal = source.items().stream().map(BillingIncomeSource.Item::amount)
				.reduce(BigDecimal.ZERO, BigDecimal::add);
			if (source.amount().signum() <= 0 || source.items().stream().anyMatch(item -> item.amount().signum() < 0)) {
				issues.add(new Issue("charge:" + source.chargeId(), "CHARGE_POLICY_REVIEW_REQUIRED",
					"0원·음수 청구의 회계 처리 확인 필요", source.amount().toPlainString(), path, null));
				continue;
			}
			if (source.items().isEmpty() || itemTotal.compareTo(source.amount()) != 0) {
				issues.add(new Issue("charge:" + source.chargeId(), "CHARGE_ITEMS_REVIEW_REQUIRED",
					"부과 항목과 청구액 확인 필요", source.amount().toPlainString(), path, null));
				continue;
			}
			for (BillingIncomeSource.Item item : source.items()) {
				if (item.amount().signum() == 0)
					continue;
				RevenueAccountingReview review = latest.get(item.sourceTemplateItemId());
				IncomeStatementResponse.RevenueItem previous = candidates.get(item.sourceTemplateItemId());
				BigDecimal amount = item.amount().add(previous == null ? BigDecimal.ZERO : new BigDecimal(previous.amount()));
				candidates.put(item.sourceTemplateItemId(), new IncomeStatementResponse.RevenueItem(item.sourceTemplateItemId(),
					item.name(), amount.toPlainString(), review != null && review.isRecognized(), review == null ? 0 : review.getRevision()));
				if (review == null || !review.isRecognized()) {
					continue;
				}
				records.add(new Entry("charge:" + item.id(), account.getId(), account.getName(), group(account),
					source.month(), target, item.amount().toPlainString()));
			}
		}
		revenueItems.addAll(candidates.values());
		for (IncomeStatementResponse.RevenueItem item : revenueItems) {
			if (!item.recognized())
				issues.add(new Issue("revenue:" + item.id(), "REVENUE_CLASSIFICATION_REQUIRED",
					item.name() + " 수익·예치·적립 성격 확인 필요", item.amount(),
					"/billing/monthly?month=" + start, null, item.id()));
		}
	}

	/** 귀속 월이 없는 지출은 특정 출금 월의 비용으로 추정하지 않고 조회 기간과 별개로 확인 목록에 남깁니다. */
	private void appendExpenses(UUID actor, Property property, List<AccountingAccount> sourceAccounts,
		YearMonth start, YearMonth end, UUID buildingId, List<Entry> records, List<Issue> issues,
		List<IncomeStatementResponse.Expense> expenseRows) {
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
						"미분류·보류 거래 확인 필요", row.amount(), path, null));
				continue;
			}
			if ("INCOME".equals(row.direction()) && "CONFIRMED".equals(row.status())
				&& !"HOUSEHOLD".equals(row.receiptType())
				&& within(YearMonth.from(row.date()).toString(), start, end)) {
				issues.add(new Issue("income:" + row.id(), "OTHER_INCOME_REVIEW_REQUIRED",
					"기타 입금의 수익·회수 성격 확인 필요", row.amount(), path, null));
			}
			if (!"EXPENSE".equals(row.direction()) || !"CONFIRMED".equals(row.status()) || row.expense() == null)
				continue;
			BankingResponse.Expense expense = row.expense();
			ExpenseAccountingReview review = latest.get(expense.id());
			boolean external = property.isHasBuildings() && expense.allocations().stream()
				.anyMatch(allocation -> allocation.buildingId() == null);
			if (buildingId != null && expense.allocations().stream()
				.noneMatch(allocation -> buildingId.equals(allocation.buildingId())))
				continue;
			if (review == null || external) {
				issues.add(new Issue("expense:" + expense.id(), external ? "EXTERNAL_ACCOUNTING_REVIEW_REQUIRED"
					: "EXPENSE_ACCOUNTING_REVIEW_REQUIRED", external ? "외부 부담·회수 권리의 회계 처리 확인 필요"
						: expense.category() + " 과목·귀속 월 확인 필요", row.amount(), path,
						external ? null : expense.id()));
			}
			if (external)
				continue;
			expenseRows.add(new IncomeStatementResponse.Expense(expense.id(), row.id(), row.date(), expense.category(),
				row.amount(), review == null ? null : review.getAccountId(), review == null ? null
					: YearMonth.from(review.getRecognitionMonth()).toString(), review == null ? 0 : review.getRevision()));
			if (review == null || !within(YearMonth.from(review.getRecognitionMonth()).toString(), start, end))
				continue;
			AccountingAccount account = byAccount.get(review.getAccountId());
			if (account == null || !account.getReportGroup().isExpense())
				throw new IllegalStateException("Invalid expense account");
			String month = YearMonth.from(review.getRecognitionMonth()).toString();
			if (!property.isHasBuildings()) {
				records.add(new Entry("expense:" + expense.id(), account.getId(), account.getName(), group(account),
					month, null, row.amount()));
				continue;
			}
			for (BankingResponse.Allocation allocation : expense.allocations()) {
				if (buildingId == null || buildingId.equals(allocation.buildingId()))
					records.add(new Entry("expense:" + expense.id() + ":" + allocation.buildingId(), account.getId(),
						account.getName(), group(account), month, allocation.buildingId(), allocation.amount()));
			}
		}
	}

	private boolean within(String month, YearMonth start, YearMonth end) {
		return month.compareTo(start.toString()) >= 0 && month.compareTo(end.toString()) <= 0;
	}

	private String group(AccountingAccount account) {
		return switch (account.getReportGroup()) {
			case OPERATING_REVENUE -> "operatingRevenue";
			case OPERATING_EXPENSE -> "operatingExpense";
			case OTHER_REVENUE -> "otherRevenue";
			case OTHER_EXPENSE -> "otherExpense";
		};
	}
}
