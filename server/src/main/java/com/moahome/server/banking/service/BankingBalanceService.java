package com.moahome.server.banking.service;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.stream.Collectors;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

import com.moahome.server.auth.exception.*;
import com.moahome.server.banking.domain.*;
import com.moahome.server.banking.dto.*;
import com.moahome.server.banking.repo.*;
import com.moahome.server.billing.domain.BankOpeningBalance;
import com.moahome.server.billing.dto.InitialBalanceCorrection;
import com.moahome.server.billing.service.InitialBalanceCorrections;
import com.moahome.server.billing.service.BankBillingStartService;
import com.moahome.server.billing.domain.BillingCalendar;
import com.moahome.server.billing.domain.OpeningBalanceBatch;
import com.moahome.server.billing.repo.BankOpeningBalanceRepository;
import com.moahome.server.billing.repo.OpeningBalanceBatchRepository;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.expense.domain.Expense;
import com.moahome.server.expense.domain.ExpenseAllocation;
import com.moahome.server.expense.repo.*;
import com.moahome.server.payment.domain.Payment;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.payment.repo.PaymentRepository;
import com.moahome.server.property.domain.Building;
import com.moahome.server.property.domain.BuildingStatus;
import com.moahome.server.property.domain.Unit;
import com.moahome.server.property.repo.*;
import com.moahome.server.property.service.ManagementAccessService;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class BankingBalanceService {
	private final ManagementAccessService access;

	private final PropertyRepository properties;

	private final BuildingRepository buildings;

	private final UnitRepository units;

	private final BankTransactionRepository transactions;

	private final BankAccountRepository accounts;

	private final BankTransferRepository transfers;
	private final BankTransferPostingService transferPostings;

	private final PaymentRepository payments;

	private final ExpenseRepository expenses;

	private final ExpenseAllocationRepository allocations;

	private final BuildingCashOpeningRepository openings;

	private final BuildingCashOpeningChangeRepository openingChanges;

	private final ExternalSettlementLinkRepository links;

	private final ExternalSettlementDecisionRepository decisions;

	private final PaymentTextSecurity security;

	private final Clock clock;

	private final BankBalanceCheckRepository balanceChecks;

	private final InitialBalanceCorrections corrections;

	private final BankBillingStartService billingStart;

	private final IncomeAllocationRepository incomeAllocations;

	private final OpeningBalanceBatchRepository openingBatches;

	private final BankOpeningBalanceRepository bankOpenings;

	public BankingBalanceService(ManagementAccessService access, PropertyRepository properties,
	    BuildingRepository buildings, UnitRepository units, BankTransactionRepository transactions,
	    BankAccountRepository accounts, PaymentRepository payments, ExpenseRepository expenses,
	    ExpenseAllocationRepository allocations, BuildingCashOpeningRepository openings,
	    BuildingCashOpeningChangeRepository openingChanges, ExternalSettlementLinkRepository links,
	    ExternalSettlementDecisionRepository decisions, @Lazy PaymentTextSecurity security, Clock clock,
	    IncomeAllocationRepository incomeAllocations,
	    OpeningBalanceBatchRepository openingBatches,
	    BankOpeningBalanceRepository bankOpenings, BankTransferRepository transfers,
	    BankBalanceCheckRepository balanceChecks, InitialBalanceCorrections corrections, BankBillingStartService billingStart, BankTransferPostingService transferPostings) {
		this.access = access;
		this.properties = properties;
		this.buildings = buildings;
		this.units = units;
		this.transactions = transactions;
		this.accounts = accounts;
		this.payments = payments;
		this.expenses = expenses;
		this.allocations = allocations;
		this.openings = openings;
		this.openingChanges = openingChanges;
		this.links = links;
		this.decisions = decisions;
		this.security = security;
		this.clock = clock;
		this.incomeAllocations = incomeAllocations;
		this.openingBatches = openingBatches;
		this.bankOpenings = bankOpenings;
		this.transfers = transfers;
		this.transferPostings = transferPostings;
		this.balanceChecks = balanceChecks;
		this.corrections = corrections;
		this.billingStart = billingStart;
	}

	private LocalDate today() {
		return LocalDate.now(clock.withZone(BillingCalendar.ZONE));
	}

	/** 모든 조회·변경은 기존 통장 관리와 동일한 관리대상의 ADMIN / MANAGER 권한을 사용합니다. */
	private void requireManagementAccess(UUID user, UUID property) {
		access.getManagementContext(user, property);
	}

	/** 수납 변경·업로드와 같은 관리대상 잠금으로 시작 잔고·회수액의 동시 초과 처리를 막습니다. */
	private void lock(UUID user, UUID property) {
		requireManagementAccess(user, property);
		properties.findForUnitUpdate(property).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		requireManagementAccess(user, property);
	}

	private boolean active(Payment p) {
		return p.getDeletedAt() == null && Set.of("CONFIRMED", "OPENING").contains(p.getStatus());
	}

	private String amount(BigDecimal value) {
		return value.toPlainString();
	}

	/** 이체일부터 현재까지의 최소 보유금으로 과거 이체가 뒤의 확정 거래까지 초과시키지 않게 합니다. */
	public Map<UUID, BigDecimal> transferBalances(UUID user, UUID property, UUID accountId, LocalDate date) {
		BankingBalanceResponse.Workspace data = workspace(user, property, YearMonth.from(date).toString(),
			YearMonth.from(today()).toString(), accountId);
		Map<UUID, BigDecimal> available = new HashMap<>();
		// 사용 전 통장으로 조회 범위가 전체로 복원되면 다른 통장의 소유금을 한도로 사용하지 않습니다.
		if (!accountId.equals(data.accountId()))
			return available;
		for (BankingBalanceResponse.Building building : data.buildings()) {
			if (building.balance() == null || data.legacyOpening() != null)
				continue;
			BigDecimal balance = new BigDecimal(building.balance());
			Map<LocalDate, BigDecimal> later = new TreeMap<>();
			for (BankingBalanceResponse.Entry entry : data.entries()) {
				if (building.id().equals(entry.buildingId()) && accountId.equals(entry.accountId())
					&& entry.date().isAfter(date)) {
					BigDecimal net = new BigDecimal(entry.income()).subtract(new BigDecimal(entry.expense()));
					later.merge(entry.date(), net, BigDecimal::add);
					balance = balance.subtract(net);
				}
			}
			BigDecimal limit = balance;
			for (BigDecimal net : later.values()) {
				balance = balance.add(net);
				limit = limit.min(balance);
			}
			available.put(building.id(), limit);
		}
		return available;
	}

	/** 출금 통장의 실제 장부 한도와 동별 소유금 한도를 같은 조회에서 제공합니다. */
	public BankingResponse.TransferFunds transferFunds(UUID user, UUID property, UUID account, LocalDate date) {
		if (date == null || date.isAfter(today())) throw new PaymentException("INVALID_MANUAL_TRANSFER");
		BankingBalanceResponse.Workspace data = workspace(user, property, YearMonth.from(date).toString(),
			YearMonth.from(today()).toString(), account);
		String available = null;
		if (account.equals(data.accountId())) {
			String closing = data.accounts().stream().filter(value -> account.equals(value.id()))
				.map(BankingBalanceResponse.AccountBalance::calculatedBalance).filter(Objects::nonNull).findFirst().orElse(null);
			if (closing != null) {
				List<BankTransaction> bank = transactions.findByPropertyId(property).stream().filter(value -> value.getDeletedAt() == null).toList();
				List<Payment> receipts = payments.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(property).stream().filter(this::active).toList();
				List<BuildingCashCalculation.Movement> movements = accountMovements(property, account, bank, receipts,
					expenses.findByPropertyIdOrderByConfirmedAtDesc(property));
				Map<LocalDate, BigDecimal> later = new TreeMap<>();
				BigDecimal balance = new BigDecimal(closing);
				for (BuildingCashCalculation.Movement movement : movements) {
					if (!movement.date().isAfter(date) || movement.date().isAfter(today())) continue;
					BigDecimal net = movement.income().subtract(movement.expense());
					later.merge(movement.date(), net, BigDecimal::add);
					balance = balance.subtract(net);
				}
				BigDecimal limit = balance;
				for (BigDecimal net : later.values()) { balance = balance.add(net); limit = limit.min(balance); }
				available = amount(limit.max(BigDecimal.ZERO));
			}
		}
		Map<UUID, BigDecimal> owned = transferBalances(user, property, account, date);
		return new BankingResponse.TransferFunds(property, account, date, available, data.buildings().stream().map(value -> {
			BigDecimal limit = owned.get(value.id());
			return new BankingResponse.TransferFund(value.id(), limit == null ? null : amount(limit.max(BigDecimal.ZERO)));
		}).toList());
	}

	/** 한 시점의 확정 현금·외부 회수 이력을 읽고 기준일 이전은 확인된 동별 현금을 역산하고 귀속 미확인 금액은 임의 배분하지 않습니다. */
	public BankingBalanceResponse.Workspace workspace(UUID user, UUID property, String rawMonth) {
		return workspace(user, property, rawMonth, null);
	}

	/** 선택 통장은 동별 기준값·입출금·정산까지 같은 범위로 조회하고 전체는 통장별 계산 결과를 합산합니다. */
	public BankingBalanceResponse.Workspace workspace(UUID user, UUID property, String rawMonth, UUID accountId) {
		return workspace(user, property, rawMonth, rawMonth, accountId);
	}

	/** 기간 조회도 한 트랜잭션의 원천으로 계산하며 잔액·미회수는 종료 월 시점, 입출금은 선택 기간으로 구분합니다. */
	public BankingBalanceResponse.Workspace workspace(UUID user, UUID property, String rawStartMonth, String rawMonth,
	    UUID accountId) {
		requireManagementAccess(user, property);
		YearMonth startMonth = BillingCalendar.parseMonth(rawStartMonth);
		YearMonth month = BillingCalendar.parseMonth(rawMonth);
		if (startMonth.isAfter(month))
			throw new PaymentException("INVALID_BALANCE_PERIOD");
		LocalDate end = month.atEndOfMonth();
		List<BankAccount> common = accounts.findByPropertyIdAndDeletedAtIsNull(property).stream()
		    .filter(a -> a.getBuildingId() == null).toList();
		if (common.stream().filter(a -> a.isPrimary() && a.getStatus() == BankAccountStatus.ACTIVE).count() != 1
		    || (accountId != null && common.stream().noneMatch(a -> a.getId().equals(accountId))))
			throw new PaymentException("PAYMENT_ACCOUNT_UNAVAILABLE");
		List<BuildingCashOpening> allOpenings = openings.findByPropertyId(property);
		List<Expense> allExpenses = expenses.findByPropertyIdOrderByConfirmedAtDesc(property);
		List<BankTransaction> allBankHistory = transactions.findByPropertyId(property);
		Map<UUID, BankTransaction> historyById = allBankHistory.stream().collect(Collectors.toMap(BankTransaction::getId, value -> value));
		List<BankTransaction> allBank = allBankHistory.stream().filter(t -> t.getDeletedAt() == null).toList();
		Map<UUID, BankTransaction> allBankById = allBank.stream()
		    .collect(Collectors.toMap(bankTransaction -> bankTransaction.getId(), t -> t));
		List<Payment> allReceipts = payments.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(property).stream()
		    .filter(this::active)
		    .filter(p -> p.getBankTransactionId() == null
		        ? "MANUAL".equals(p.getSourceType())
		        : allBankById.containsKey(p.getBankTransactionId())
		            && "INCOME".equals(allBankById.get(p.getBankTransactionId()).getDirection()))
		    .toList();
		List<OpeningBalanceBatch> confirmedBatches = openingBatches.findByPropertyIdOrderByCreatedAtDesc(property)
		    .stream().filter(batch -> "CONFIRMED".equals(batch.getStatus())).toList();
		List<BankOpeningBalance> independentOpenings = bankOpenings
		    .findByPropertyIdAndBatchIdIsNullOrderByRevisionDesc(property);
		Map<UUID, Expense> allExpenseById = allExpenses.stream()
		    .filter(e -> "MANUAL".equals(e.getSourceType()) || allBankById.containsKey(e.getBankTransactionId()))
		    .collect(Collectors.toMap(entry -> entry.getId(), e -> e));
		List<ExpenseAllocation> allParts = allocations.findByPropertyIdOrderBySortOrderAsc(property).stream()
		    .filter(a -> allExpenseById.containsKey(a.getExpenseId())).toList();
		List<ExternalSettlementLink> allLinks = links.findByPropertyId(property);
		Map<UUID, ExternalSettlementDecision> decisionByAllocation = decisions
		    .findByPropertyIdOrderByRevisionAsc(property).stream()
		    .collect(Collectors.toMap(externalSettlementDecision -> externalSettlementDecision.getAllocationId(), d -> d, (previous, next) -> next));
		Map<UUID, List<IncomeAllocation>> distributed = incomeAllocations.findByPropertyIdOrderBySortOrderAsc(property)
		    .stream().collect(Collectors.groupingBy(incomeAllocation -> incomeAllocation.getPaymentId()));
		ArrayList<BankingBalanceResponse.Entry> allEntries = new ArrayList<BankingBalanceResponse.Entry>();
		for (var p : allReceipts) {
			if ("OTHER".equals(p.getReceiptType()) && distributed.containsKey(p.getId())) {
				var original = allBankById.get(p.getBankTransactionId());
				for (var part : distributed.get(p.getId()))
					allEntries.add(new BankingBalanceResponse.Entry(original == null ? p.getId() : original.getId(),
					    part.getBuildingId(), p.getPaymentDate(),
					    original == null ? null : original.getTransactionTime(),
					    security.decrypt(p.getIncomeCategoryEncrypted()), amount(part.getAmount()), "0", p.getId(),
					    p.getBankAccountId()));
				continue;
			}
			if (!"HOUSEHOLD".equals(p.getReceiptType()) || p.getCashBuildingId() == null)
				continue;
			var original = allBankById.get(p.getBankTransactionId());
			allEntries.add(
			    new BankingBalanceResponse.Entry(original == null ? p.getId() : original.getId(), p.getCashBuildingId(), p.getPaymentDate(),
			        original == null ? null : original.getTransactionTime(), security.decrypt(p.getPayerNameEncrypted()), amount(p.getAmount()),
			        "0", p.getId(), p.getBankAccountId()));
		}
		for (var part : allParts) {
			if (part.getBuildingId() == null)
				continue;
			var e = allExpenseById.get(part.getExpenseId());
			var original = allBankById.get(e.getBankTransactionId());
			allEntries.add(new BankingBalanceResponse.Entry(original == null ? e.getId() : original.getId(),
			    part.getBuildingId(), e.getExpenseDate(), original == null ? null : original.getTransactionTime(),
			    security.decrypt(e.getCategoryEncrypted()), "0", amount(part.getAllocatedAmount()), null,
			    e.getBankAccountId()));
		}
		allEntries.addAll(transferPostings.buildingEntries(property));
		List<BankBalanceCheck> directChecks = balanceChecks.findByPropertyIdOrderByCheckedAtDescCreatedAtDesc(property);
		// 계좌별 마지막 원본과 인계값을 각각 확인합니다. 한 통장이라도 미확인이면 전체를 0원으로 대체하지 않습니다.
		var openingBatch = confirmedBatches.stream().filter(batch -> !batch.getCutoffDate().isAfter(end)).findFirst();
		List<BankOpeningBalance> baselines = openingBatch.map(batch -> bankOpenings.findByBatchId(batch.getId()))
		    .orElse(List.of());
		// 장부는 현재 유효한 초기 기준에서 과거 월도 역산하지만 은행 확인값은 조회 월 이후 자료를 사용하지 않습니다.
		List<BankOpeningBalance> ledgerBaselines = confirmedBatches.isEmpty() ? List.of()
		    : bankOpenings.findByBatchId(confirmedBatches.getFirst().getId());
		Map<UUID, BankOpeningBalance> independent = independentOpenings.stream()
		    .collect(Collectors.toMap(o -> o.getBankAccountId(), o -> o, (latest, older) -> latest));
		ArrayList<BankingBalanceResponse.AccountBalance> allAccountBalances = new ArrayList<BankingBalanceResponse.AccountBalance>();
		for (var account : common) {
			List<BankTransaction> accountRows = allBank.stream()
			    .filter(t -> t.getBankAccountId().equals(account.getId()) && !t.getTransactionDate().isAfter(end))
			    .toList();
			var last = accountRows.stream().max(Comparator.comparing((BankTransaction bankTransaction) -> bankTransaction.getTransactionDate())
			    .thenComparing(t -> t.getTransactionTime() == null ? LocalTime.MIN : t.getTransactionTime()));
			List<BankTransaction> lastDay = last.map(
			    t -> accountRows.stream().filter(b -> b.getTransactionDate().equals(t.getTransactionDate())).toList())
			    .orElse(List.of());
			boolean ambiguous = lastDay.size() > 1
			    && (lastDay.stream().anyMatch(t -> t.getTransactionTime() == null) || last.map(
			        t -> lastDay.stream().filter(b -> Objects.equals(t.getTransactionTime(), b.getTransactionTime()))
			            .map(bankTransaction -> bankTransaction.getBalance()).distinct().count() > 1)
			        .orElse(false));
			var registered = independent.get(account.getId());
			var handover = baselines.stream().filter(row -> row.getBankAccountId().equals(account.getId())).findFirst()
			    .orElse(null);
			var configured = registered != null ? registered
			    : ledgerBaselines.stream().filter(row -> row.getBankAccountId().equals(account.getId())).findFirst()
			        .orElse(null);
			List<BankBalanceSelection.Candidate> candidates = new ArrayList<>();
			last.ifPresent(t -> candidates.add(new BankBalanceSelection.Candidate("BANK_IMPORT", t.getId(),
			    t.getTransactionDate(), ambiguous ? null : t.getTransactionTime(),
			    ambiguous || t.getTransactionTime() == null ? "DATE" : "TIME",
			    ambiguous || t.getBalance() == null ? null : amount(t.getBalance()),
			    ambiguous ? "ORDER_UNCLEAR" : t.getBalance() == null ? "BALANCE_MISSING" : "READY", t.getImportedAt())));
			// 독립 등록의 최신 revision이 과거 조회 범위 밖이면 그 월까지의 기록을 기준시점으로 다시 선택합니다.
			for (BankOpeningBalance opening : independentOpenings) {
				if (opening.getBankAccountId().equals(account.getId()) && !opening.getCutoffDate().isAfter(end)) {
					candidates.add(new BankBalanceSelection.Candidate("ACCOUNT_OPENING", opening.getId(),
					    opening.getCutoffDate(), null, "DAY_END", amount(opening.getAmount()), "READY", opening.getRecordedAt()));
					break;
				}
			}
			if (handover != null && !handover.getCutoffDate().isAfter(end))
				candidates.add(new BankBalanceSelection.Candidate("HANDOVER", handover.getId(),
				    handover.getCutoffDate(), null, "DAY_END", amount(handover.getAmount()), "READY", handover.getRecordedAt()));
			for (BankBalanceCheck check : directChecks) {
				var at = check.getCheckedAt().atZoneSameInstant(BillingCalendar.ZONE);
				if (check.getBankAccountId().equals(account.getId()) && check.getCanceledAt() == null
				    && !at.toLocalDate().isAfter(end))
					candidates.add(new BankBalanceSelection.Candidate("DIRECT_CHECK", check.getId(), at.toLocalDate(),
					    at.toLocalTime(), "TIME", amount(check.getBalanceAmount()), "READY", check.getCreatedAt()));
			}
			// 관리자가 통장 안의 전체 동 보유금을 같은 기준일로 확정했다면 그 합계도 유효한 수동 잔액 근거입니다.
			// 일부 동만 설정된 합계는 통장 전체 자금으로 간주하지 않습니다.
			List<BuildingCashOpening> owned = allOpenings.stream().filter(value -> account.getId().equals(value.getBankAccountId())).toList();
			Set<UUID> ownedIds = owned.stream().map(value -> value.getBuildingId()).collect(Collectors.toSet());
			List<Building> activeBuildings = buildings.findByPropertyId(property).stream()
			    .filter(value -> value.getDeletedAt() == null && value.getStatus() == BuildingStatus.ACTIVE).toList();
			if (!owned.isEmpty() && !activeBuildings.isEmpty() && activeBuildings.stream().allMatch(value -> ownedIds.contains(value.getId()))
			    && owned.stream().map(value -> value.getCutoffDate()).distinct().count() == 1
			    && !owned.getFirst().getCutoffDate().isAfter(end)) {
				OffsetDateTime recorded = owned.stream().map(value -> value.getUpdatedAt() == null ? value.getCreatedAt() : value.getUpdatedAt())
				    .max(OffsetDateTime::compareTo).orElseThrow();
				boolean superseded = candidates.stream().anyMatch(candidate -> candidate.precision().equals("DAY_END")
				    && candidate.date().equals(owned.getFirst().getCutoffDate()) && candidate.recordedAt() != null
				    && !candidate.recordedAt().isBefore(recorded));
				if (!superseded) candidates.add(new BankBalanceSelection.Candidate("BUILDING_OPENING", owned.getFirst().getId(),
				    owned.getFirst().getCutoffDate(), null, "DAY_END", amount(owned.stream().map(value -> value.getAmount())
				        .reduce(BigDecimal.ZERO, BigDecimal::add)), "READY", recorded));
			}
			var selected = BankBalanceSelection.select(candidates);
			String value = selected == null ? null : selected.amount();
			String asOf = selected == null
			    ? null
			    : selected.date() + (selected.status().equals("ORDER_UNCLEAR")
			        ? " 확인 순서 확인 필요"
			        : selected.status().equals("BALANCE_MISSING")
			            ? " 잔고 미제공"
			            : selected.precision().equals("DAY_END")
			                ? " 마감 잔액"
			                : selected.time() == null ? "" : " " + selected.time());

			// 현재 돈은 시작 잔액과 실제 통장 거래 원장에서 계산합니다. 나중에 확인한 은행 금액으로 원장을 덮어쓰지 않습니다.
			List<BankBalanceSelection.Candidate> ledgerBases = new ArrayList<>();
			if (configured != null) ledgerBases.add(new BankBalanceSelection.Candidate("ACCOUNT_OPENING", configured.getId(),
			    configured.getCutoffDate(), null, "DAY_END", amount(configured.getAmount()), "READY", configured.getRecordedAt()));
			// 동별 시작 보유금을 모두 확정했다면 같은 돈의 수동 시작 근거로 사용합니다.
			if (!owned.isEmpty() && !activeBuildings.isEmpty() && activeBuildings.stream().allMatch(valueBuilding -> ownedIds.contains(valueBuilding.getId()))
			    && owned.stream().map(BuildingCashOpening::getCutoffDate).distinct().count() == 1) {
				OffsetDateTime recorded = owned.stream().map(valueOpening -> valueOpening.getUpdatedAt() == null ? valueOpening.getCreatedAt() : valueOpening.getUpdatedAt())
				    .max(OffsetDateTime::compareTo).orElseThrow();
				boolean sameExisting = ledgerBases.stream().anyMatch(candidate -> candidate.date().equals(owned.getFirst().getCutoffDate())
				    && candidate.recordedAt() != null && !candidate.recordedAt().isBefore(recorded));
				if (!sameExisting) ledgerBases.add(new BankBalanceSelection.Candidate("BUILDING_OPENING", owned.getFirst().getId(),
				    owned.getFirst().getCutoffDate(), null, "DAY_END", amount(owned.stream().map(BuildingCashOpening::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add)), "READY", recorded));
			}
			BankBalanceSelection.Candidate basis = BankBalanceSelection.select(ledgerBases);
			AccountCalculation calculated;
			if (basis != null && basis.amount() != null && "READY".equals(basis.status())) {
				calculated = calculateFromOpening(property, account.getId(), month, new BigDecimal(basis.amount()), basis.date(), allBank, allReceipts, allExpenses);
			} else {
				// 시작 금액이 없을 때만 최초의 유효 은행 거래 잔액을 기초로 삼고 이후에는 거래만 누적합니다.
				List<BankBalanceSelection.Candidate> bootstraps = allBankHistory.stream().filter(row -> account.getId().equals(row.getBankAccountId())
				    && row.getBalance() != null && !row.getTransactionDate().isAfter(end))
				    .map(row -> new BankBalanceSelection.Candidate("BANK_IMPORT", row.getId(), row.getTransactionDate(), row.getTransactionTime(),
				        row.getTransactionTime() == null ? "DATE" : "TIME", amount(row.getBalance()), "READY", row.getImportedAt()))
				    .sorted(Comparator.comparing(BankBalanceSelection.Candidate::date).thenComparing(valueCandidate -> valueCandidate.time() == null ? LocalTime.MIN : valueCandidate.time())).toList();
				// 은행 확인은 시점이 다른 참고 기록입니다. 원장 기준이 없다는 이유로 현재 금액의 시작값으로 승격하지 않습니다.
				BankBalanceSelection.Candidate first = bootstraps.isEmpty() ? null : bootstraps.getFirst();
				calculated = calculateObservedAccount(property, account.getId(), end, first, historyById, allReceipts, allExpenses);
			}

			allAccountBalances.add(new BankingBalanceResponse.AccountBalance(account.getId(),
			    account.getBankName() + " ····" + account.getAccountLast4()
			        + (account.getAlias() == null ? "" : " · " + account.getAlias()),
			    account.getStatus().name(), value, asOf, configured == null ? null : configured.getCutoffDate(),
			    configured == null ? null : amount(configured.getAmount()),
			    registered == null ? 0 : registered.getRevision(),
			    calculated == null ? null : amount(calculated.balance()),
			    calculated == null ? null : calculated.cutoff(),
			    selected == null
			        ? null
			        : new BankingBalanceResponse.Confirmation(selected.source(), selected.id(), selected.date(),
			            selected.time(), selected.precision(), selected.status(),
			            directChecks.stream().filter(check -> check.getId().equals(selected.id()))
			                .map(bankBalanceCheck -> bankBalanceCheck.getSourceType()).findFirst().orElse(null)),
			    selected != null && (!selected.date().equals(end) || !selected.precision().equals("DAY_END")),
			    calculated == null ? "UNAVAILABLE" : calculated.source()));
		}
		Map<UUID, BankAccountRepository.Usage> usage = accounts.findUsageByPropertyId(property).stream()
		    .collect(Collectors.toMap(entry -> entry.getAccountId(), item -> item));
		Map<UUID, BankingBalanceResponse.AccountBalance> balancesById = allAccountBalances.stream()
		    .collect(Collectors.toMap(accountBalance -> accountBalance.id(), item -> item));
		Set<UUID> unsettled = unsettledAccounts(end, allExpenseById, allParts, allLinks, allReceipts,
		    decisionByAllocation);
		// 앱 등록 전 실제 입출금은 과거 사용 근거입니다. 초기 잔고 날짜만으로 새 통장을 생성 전 월에 표시하지 않습니다.
		List<BankAccount> availableAccounts = common.stream().filter(a -> {
			var history = usage.get(a.getId());
			LocalDate firstUse = history == null ? null : history.getFirstUse();
			if (a.availableFrom(firstUse).isAfter(end)
			    || (a.getStatus() == BankAccountStatus.CLOSED && firstUse == null))
				return false;
			if (a.getStatus() != BankAccountStatus.CLOSED || a.getValidTo() == null
			    || !startMonth.atDay(1).isAfter(a.getValidTo()))
				return true;
			// 종료 후에도 잔액·동별 소유금·외부 미회수액은 사라지면 안 됩니다. 미확인은 0원으로 간주하지 않습니다.
			return hasRetainedFunds(balancesById.get(a.getId()))
			    || hasBuildingFunds(a.getId(), month, allOpenings, allEntries) || unsettled.contains(a.getId());
		}).toList();
		UUID selectedAccountId = accountId != null
		    && availableAccounts.stream().anyMatch(a -> a.getId().equals(accountId)) ? accountId : null;
		List<BankAccount> scopedAccounts = availableAccounts.stream()
		    .filter(a -> selectedAccountId == null || selectedAccountId.equals(a.getId())).toList();
		Set<UUID> accountIds = scopedAccounts.stream().map(bankAccount -> bankAccount.getId()).collect(Collectors.toSet());
		boolean legacy = !scopedAccounts.isEmpty() && selectedAccountId == null
		    && allOpenings.stream().noneMatch(o -> o.getBankAccountId() != null);
		List<BuildingCashOpening> savedOpenings = allOpenings.stream()
		    .filter(o -> legacy
		        ? o.getBankAccountId() == null
		        : o.getBankAccountId() != null && accountIds.contains(o.getBankAccountId()))
		    .toList();
		List<LocalDate> dates = savedOpenings.stream().map(buildingCashOpening -> buildingCashOpening.getCutoffDate()).distinct().toList();
		LocalDate cutoff = dates.size() == 1 ? dates.getFirst() : null;
		LocalDate latestCutoff = dates.stream().max((localDate, other) -> localDate.compareTo(other)).orElse(end);
		LocalDate firstCutoff = dates.stream().min((localDate, other) -> localDate.compareTo(other)).orElse(null);
		Map<UUID, List<BuildingCashOpening>> openingByBuilding = savedOpenings.stream()
		    .collect(Collectors.groupingBy(buildingCashOpening -> buildingCashOpening.getBuildingId()));
		// 각 통장의 기준일이 달라도 모든 계산에 필요한 원본을 읽고 통장별 기준일로 각각 누적·역산합니다.
		LocalDate readEnd = latestCutoff.isAfter(end) ? latestCutoff : end;
		LocalDate reviewStart = firstCutoff == null || startMonth.atDay(1).isBefore(firstCutoff)
		    ? startMonth.atDay(1).minusDays(1)
		    : firstCutoff;
		List<BankTransaction> bank = allBank.stream()
		    .filter(t -> accountIds.contains(t.getBankAccountId()) && !t.getTransactionDate().isAfter(readEnd))
		    .toList();
		Map<UUID, BankTransaction> bankById = bank.stream().collect(Collectors.toMap(bankTransaction -> bankTransaction.getId(), t -> t));
		// 확정 수동 입금도 장부에 반영하며 은행 확인값은 원본·초기 잔액·직접 확인 이력으로 별도 보존합니다.
		List<Payment> receipts = allReceipts.stream()
		    .filter(p -> accountIds.contains(p.getBankAccountId()) && !p.getPaymentDate().isAfter(readEnd)).toList();
		Map<UUID, Payment> receiptById = receipts.stream().filter(p -> !p.getPaymentDate().isAfter(end))
		    .collect(Collectors.toMap(entry -> entry.getId(), p -> p));
		Map<UUID, Expense> expenseById = allExpenses.stream()
		    .filter(e -> "MANUAL".equals(e.getSourceType())
		        ? accountIds.contains(e.getBankAccountId()) && !e.getExpenseDate().isAfter(readEnd)
		        : bankById.containsKey(e.getBankTransactionId()))
		    .collect(Collectors.toMap(e -> e.getId(), e -> e));
		List<ExpenseAllocation> parts = allParts.stream().filter(a -> expenseById.containsKey(a.getExpenseId()))
		    .toList();
		// 삭제한 출금의 회수 연결은 이력만 유지하고 기타 입금의 사용 가능액을 다시 엽니다.
		Set<UUID> liveParts = parts.stream().map(a -> a.getId()).collect(Collectors.toSet());
		List<ExternalSettlementLink> savedLinks = allLinks.stream()
		    .filter(l -> receiptById.containsKey(l.getPaymentId()) && liveParts.contains(l.getAllocationId())).toList();
		Map<UUID, BigDecimal> spent = savedLinks.stream()
		    .collect(Collectors.groupingBy(externalSettlementLink -> externalSettlementLink.getPaymentId(),
		        Collectors.reducing(BigDecimal.ZERO, externalSettlementLink -> externalSettlementLink.getAmount(), (bigDecimal, other) -> bigDecimal.add(other))));
		List<BankingBalanceResponse.Entry> entries = allEntries.stream()
		    .filter(e -> accountIds.contains(e.accountId()) && !e.date().isAfter(readEnd)).toList();
		ArrayList<BankingBalanceResponse.Building> result = new ArrayList<BankingBalanceResponse.Building>();
		for (var b : buildings.findByPropertyId(property)) {
			if (scopedAccounts.isEmpty())
				continue;
			boolean current = b.getDeletedAt() == null && b.getStatus() == BuildingStatus.ACTIVE;
			if (!current && !openingByBuilding.containsKey(b.getId())
			    && entries.stream().noneMatch(e -> b.getId().equals(e.buildingId())))
				continue;
			List<BuildingCashOpening> buildingOpenings = openingByBuilding.getOrDefault(b.getId(), List.of());
			List<BankingBalanceResponse.Entry> buildingEntries = entries.stream()
			    .filter(e -> b.getId().equals(e.buildingId())).toList();
			BigDecimal startBalance = BigDecimal.ZERO, incomeTotal = BigDecimal.ZERO, expenseTotal = BigDecimal.ZERO,
			    endBalance = BigDecimal.ZERO;
			boolean complete = true;
			List<BankingBalanceResponse.BuildingAccountBalance> accountBalances = new ArrayList<>();
			if (legacy) {
				var opening = buildingOpenings.isEmpty() ? null : buildingOpenings.getFirst();
				List<BuildingCashCalculation.Movement> movements = buildingEntries.stream()
				    .map(e -> new BuildingCashCalculation.Movement(e.date(), new BigDecimal(e.income()),
				        new BigDecimal(e.expense())))
				    .toList();
				var totals = BuildingCashCalculation.calculate(opening == null ? BigDecimal.ZERO : opening.getAmount(),
				    cutoff == null ? end : cutoff, startMonth, month, movements);
				complete = opening != null;
				startBalance = totals.start();
				incomeTotal = totals.income();
				expenseTotal = totals.expense();
				endBalance = totals.balance();
			} else {
				for (var account : scopedAccounts) {
					var opening = buildingOpenings.stream().filter(o -> account.getId().equals(o.getBankAccountId()))
					    .findFirst().orElse(null);
					List<BankingBalanceResponse.Entry> accountEntries = buildingEntries.stream()
					    .filter(e -> account.getId().equals(e.accountId())).toList();
					if (opening == null && accountEntries.isEmpty() && account.getStatus() == BankAccountStatus.CLOSED)
						continue;
					if (!current && opening == null && accountEntries.isEmpty())
						continue;
					List<BuildingCashCalculation.Movement> movements = accountEntries.stream()
					    .map(e -> new BuildingCashCalculation.Movement(e.date(), new BigDecimal(e.income()),
					        new BigDecimal(e.expense())))
					    .toList();
					var totals = BuildingCashCalculation.calculate(
					    opening == null ? BigDecimal.ZERO : opening.getAmount(),
					    opening == null ? end : opening.getCutoffDate(), startMonth, month, movements);
					// 같은 계산 결과를 계좌 필터에도 제공해 전체 동 잔액을 개별 계좌 잔액으로 잘못 출력하지 않습니다.
					accountBalances.add(new BankingBalanceResponse.BuildingAccountBalance(account.getId(),
					    opening == null ? null : amount(totals.start()),
					    opening == null ? null : amount(totals.balance())));
					complete &= opening != null;
					startBalance = startBalance.add(totals.start());
					incomeTotal = incomeTotal.add(totals.income());
					expenseTotal = expenseTotal.add(totals.expense());
					endBalance = endBalance.add(totals.balance());
				}
			}
			var direct = buildingOpenings.size() == 1 ? buildingOpenings.getFirst() : null;
			result.add(new BankingBalanceResponse.Building(b.getId(), b.getName(), current,
			    complete ? amount(startBalance) : null, amount(incomeTotal), amount(expenseTotal),
			    complete ? amount(endBalance) : null, complete ? "READY" : "OPENING_REQUIRED",
			    direct == null ? null : amount(direct.getAmount()), direct == null ? 0 : direct.getRevision(),
			    accountBalances));
		}
		ArrayList<BankingBalanceResponse.External> external = new ArrayList<BankingBalanceResponse.External>();
		for (var part : parts) {
			if (part.getBuildingId() != null)
				continue;
			var expense = expenseById.get(part.getExpenseId());
			var original = bankById.get(expense.getBankTransactionId());
			var expenseCutoff = legacy
			    ? cutoff
			    : savedOpenings.stream().filter(o -> expense.getBankAccountId().equals(o.getBankAccountId()))
			        .map(buildingCashOpening -> buildingCashOpening.getCutoffDate()).findFirst().orElse(null);
			if (expenseCutoff == null || !expense.getExpenseDate().isAfter(expenseCutoff)
			    || expense.getExpenseDate().isAfter(end))
				continue;
			List<BankingBalanceResponse.Recovery> recoveries = savedLinks.stream()
			    .filter(l -> l.getAllocationId().equals(part.getId())).map(l -> {
				    var p = receiptById.get(l.getPaymentId());
				    return new BankingBalanceResponse.Recovery(l.getId(), p.getId(), p.getPaymentDate(),
				        security.decrypt(p.getPayerNameEncrypted()), amount(l.getAmount()));
			    }).toList();
			var recovered = recoveries.stream().map(r -> new BigDecimal(r.amount())).reduce(BigDecimal.ZERO,
			    (bigDecimal, other) -> bigDecimal.add(other));
			var decision = decisionByAllocation.get(part.getId());
			// 잘못 가져온 출금은 기존 거래 삭제로 제거합니다. 부담액과 원본 전액을 함께 반환해 삭제 범위를 확인하게 합니다.
			external.add(new BankingBalanceResponse.External(part.getId(),
			    security.decrypt(part.getTargetLabelEncrypted()), security.decrypt(expense.getCategoryEncrypted()),
			    expense.getExpenseDate(), amount(part.getAllocatedAmount()), amount(recovered),
			    amount(part.getAllocatedAmount().subtract(recovered)), recoveries,
			    decision != null && decision.isExcluded(), decision == null ? 0 : decision.getRevision(),
			    expense.getBankAccountId(), original == null ? null : original.getId(),
			    amount(expense.getTotalAmount())));
		}
		Map<UUID, Unit> unitById = units.findByPropertyId(property).stream()
		    .collect(Collectors.toMap(u -> u.getId(), u -> u));
		Map<UUID, Building> buildingById = buildings.findByPropertyId(property).stream()
		    .collect(Collectors.toMap(b -> b.getId(), b -> b));
		ArrayList<BankingBalanceResponse.Income> income = new ArrayList<BankingBalanceResponse.Income>();
		for (var p : receipts) {
			if (!"CONFIRMED".equals(p.getStatus())) continue;
			if (!p.getPaymentDate().isAfter(reviewStart))
				continue;
			if (("HOUSEHOLD".equals(p.getReceiptType()) && p.getCashBuildingId() != null)
			    || distributed.containsKey(p.getId()))
				continue;
			// 현재 연결 세대는 확인용 단서입니다. 이 위치로 과거 귀속을 자동 확정하지 않습니다.
			var matched = unitById.get(p.getMatchedUnitId());
			var linkedBuilding = matched == null ? null : buildingById.get(matched.getBuildingId());
			String linkedUnitLabel = matched == null
			    ? null
			    : (linkedBuilding == null ? "" : linkedBuilding.getName() + " ") + matched.getUnitNumber() + "호";
			income.add(new BankingBalanceResponse.Income(p.getId(), p.getBankTransactionId(), p.getPaymentDate(),
			    security.decrypt(p.getPayerNameEncrypted()), amount(p.getAmount()),
			    amount(p.getAmount().subtract(spent.getOrDefault(p.getId(), BigDecimal.ZERO))), p.getReceiptType(),
			    linkedBuilding == null ? null : linkedBuilding.getId(), linkedUnitLabel, p.getBankAccountId()));
		}
		Set<UUID> confirmedTransactions = receipts.stream().map(entry -> entry.getBankTransactionId())
		    .collect(Collectors.toSet());
		confirmedTransactions.addAll(expenseById.values().stream().map(e -> e.getBankTransactionId()).toList());
		transfers.findByPropertyId(property).stream().filter(t -> t.getCanceledAt() == null).forEach(t -> {
			confirmedTransactions.add(t.getOutgoingId());
			confirmedTransactions.add(t.getIncomingId());
		});
		transferPostings.all(property).forEach(value -> {
			confirmedTransactions.add(value.getSourceTransactionId());
			if (value.getCounterpartTransactionId() != null) confirmedTransactions.add(value.getCounterpartTransactionId());
		});
		List<BankingBalanceResponse.Pending> pending = bank.stream()
		    .filter(t -> t.getTransactionDate().isAfter(reviewStart) && !confirmedTransactions.contains(t.getId()))
		    .map(t -> new BankingBalanceResponse.Pending(t.getId(), t.getTransactionDate(),
		        (t.isTransferCandidate() ? "이체 연결 대기 · " : "") + security.decrypt(t.getPayerNameEncrypted()),
		        t.getDirection(), amount(t.getAmount())))
		    .toList();
		if (!buildings.findByPropertyId(property).isEmpty()) {
			List<BankingBalanceResponse.Pending> missing = new ArrayList<>(pending);
			for (BankTransferPosting posting : transferPostings.all(property)) {
				BankTransaction source = allBankById.get(posting.getSourceTransactionId());
				if (posting.getCanceledAt() != null || source == null || source.getTransactionDate().isAfter(end)
				    || !(accountIds.contains(source.getBankAccountId()) || accountIds.contains(posting.getCounterpartAccountId()))
				    || !transferPostings.allocations(property, posting.getId()).isEmpty()) continue;
				missing.add(new BankingBalanceResponse.Pending(source.getId(), source.getTransactionDate(),
				    "통장간 거래 · 동별 이동금액 설정 필요", source.getDirection(), amount(source.getAmount())));
			}
			pending = missing;
		}
		Set<UUID> visibleIds = availableAccounts.stream().map(bankAccount -> bankAccount.getId()).collect(Collectors.toSet());
		List<BankingBalanceResponse.AccountBalance> accountBalances = allAccountBalances.stream()
		    .filter(a -> visibleIds.contains(a.id())).toList();
		List<BankingBalanceResponse.AccountBalance> checkedAccounts = accountBalances.stream()
		    .filter(a -> selectedAccountId == null || selectedAccountId.equals(a.id())).toList();
		String confirmedBalance = checkedAccounts.isEmpty()
		    || checkedAccounts.stream().anyMatch(a -> a.balance() == null)
		        ? null
		        : checkedAccounts.stream().map(a -> new BigDecimal(a.balance()))
		            .reduce(BigDecimal.ZERO, (bigDecimal, other) -> bigDecimal.add(other)).toPlainString();
		String confirmedAsOf = checkedAccounts.size() == 1 ? checkedAccounts.getFirst().asOf() : "계좌별 확인 시점 기준 합계";
		// 통장 구분 전의 확정값은 버리지 않습니다. 소속을 입증할 수 없는 값은 참고 초안으로만 반환해 사용자가 확인합니다.
		List<BuildingCashOpening> unassigned = allOpenings.stream().filter(o -> o.getBankAccountId() == null).toList();
		var legacyOpening = selectedAccountId != null && !unassigned.isEmpty()
		    && allOpenings.stream().noneMatch(o -> o.getBankAccountId() != null)
		        ? new BankingBalanceResponse.LegacyOpening(unassigned.getFirst().getCutoffDate(),
		            unassigned.stream()
		                .map(
		                    o -> new BankingBalanceResponse.LegacyOpeningPart(o.getBuildingId(), amount(o.getAmount())))
		                .toList())
		        : null;
		var currentProperty = properties.findById(property).orElseThrow();
		return new BankingBalanceResponse.Workspace(property, rawMonth, cutoff, confirmedBalance, confirmedAsOf, result,
		    entries.stream().filter(e -> !e.date().isBefore(startMonth.atDay(1)) && !e.date().isAfter(end)).toList(), external, income, pending,
		    accountBalances, selectedAccountId, legacyOpening,
		    corrections.deadline(currentProperty),
		    corrections.allowed(currentProperty), rawStartMonth);
	}

	/** 실제 확인값과 계산값이 충돌해도 어느 쪽의 남은 돈도 숨기지 않고, 근거가 없으면 미확인으로 남깁니다. */
	private boolean hasRetainedFunds(BankingBalanceResponse.AccountBalance value) {
		return (value.balance() == null && value.calculatedBalance() == null)
		    || (value.balance() != null && new BigDecimal(value.balance()).signum() != 0)
		    || (value.calculatedBalance() != null && new BigDecimal(value.calculatedBalance()).signum() != 0);
	}

	/** 통장 합계가 0원이어도 동별 양수·음수 소유금이 상계된 경우에는 계속 정산할 수 있게 합니다. */
	private boolean hasBuildingFunds(UUID account, YearMonth month, List<BuildingCashOpening> saved,
	    List<BankingBalanceResponse.Entry> entries) {
		List<BuildingCashOpening> own = saved.stream().filter(o -> account.equals(o.getBankAccountId())).toList();
		List<BankingBalanceResponse.Entry> movements = entries.stream().filter(e -> account.equals(e.accountId()))
		    .toList();
		if (movements.stream().anyMatch(e -> own.stream().noneMatch(o -> e.buildingId().equals(o.getBuildingId()))))
			return true;
		return own.stream().anyMatch(o -> {
			List<BuildingCashCalculation.Movement> parts = movements.stream()
			    .filter(e -> o.getBuildingId().equals(e.buildingId()))
			    .map(e -> new BuildingCashCalculation.Movement(e.date(), new BigDecimal(e.income()),
			        new BigDecimal(e.expense())))
			    .toList();
			return BuildingCashCalculation.calculate(o.getAmount(), o.getCutoffDate(), month, parts).balance()
			    .signum() != 0;
		});
	}

	/** 조회 월까지의 유효 회수만 차감하고 정산 제외·삭제된 지출은 미회수 대상으로 되살리지 않습니다. */
	private Set<UUID> unsettledAccounts(LocalDate end, Map<UUID, Expense> expenses, List<ExpenseAllocation> parts,
	    List<ExternalSettlementLink> links, List<Payment> receipts, Map<UUID, ExternalSettlementDecision> decisions) {
		Set<UUID> validReceipts = receipts.stream().filter(p -> !p.getPaymentDate().isAfter(end)).map(entry -> entry.getId())
		    .collect(Collectors.toSet());
		Map<UUID, BigDecimal> recovered = links.stream().filter(l -> validReceipts.contains(l.getPaymentId()))
		    .collect(Collectors.groupingBy(externalSettlementLink -> externalSettlementLink.getAllocationId(),
		        Collectors.reducing(BigDecimal.ZERO, externalSettlementLink -> externalSettlementLink.getAmount(), (bigDecimal, other) -> bigDecimal.add(other))));
		return parts.stream().filter(p -> p.getBuildingId() == null).filter(p -> {
			var expense = expenses.get(p.getExpenseId());
			var decision = decisions.get(p.getId());
			return !expense.getExpenseDate().isAfter(end) && (decision == null || !decision.isExcluded())
			    && p.getAllocatedAmount().compareTo(recovered.getOrDefault(p.getId(), BigDecimal.ZERO)) > 0;
		}).map(p -> expenses.get(p.getExpenseId()).getBankAccountId()).collect(Collectors.toSet());
	}

	private record AccountCalculation(BigDecimal balance, LocalDate cutoff, String source) {
		private AccountCalculation(BigDecimal balance, LocalDate cutoff) {
			this(balance, cutoff, "INITIAL_BALANCE");
		}
	}

	/** 가장 최근의 유효 잔액을 기준으로 이후 수동 입출금·이체·취소를 날짜순으로 반영하며 출처로 금액을 무시하지 않습니다. */
	private AccountCalculation calculateObservedAccount(UUID property, UUID account, LocalDate end,
	    BankBalanceSelection.Candidate observed, Map<UUID, BankTransaction> bank, List<Payment> receipts, List<Expense> expenses) {
		if (observed == null || observed.amount() == null || !"READY".equals(observed.status())) return null;
		List<BankTransferPosting> relevant = transferPostings.all(property).stream().filter(posting -> !posting.isManual()).filter(posting -> {
			BankTransaction source = bank.get(posting.getSourceTransactionId());
			return source != null && !source.getTransactionDate().isAfter(end)
			    && (account.equals(source.getBankAccountId()) || account.equals(posting.getCounterpartAccountId()));
		}).toList();
		BigDecimal balance = new BigDecimal(observed.amount());
		Set<UUID> canceled = new HashSet<>(transferPostings.canceledSources(property));
		canceled.addAll(transferPostings.manualSources(property));
		for (BankTransaction row : bank.values()) {
			if (row.getDeletedAt() != null || !account.equals(row.getBankAccountId()) || row.getTransactionDate().isAfter(end) || canceled.contains(row.getId())) continue;
			if (row.getId().equals(observed.id())) continue;
			Boolean after = afterObservation(row, observed);
			if (after == null) return null;
			if (after) balance = balance.add("INCOME".equals(row.getDirection()) ? row.getAmount() : row.getAmount().negate());
		}
		for (BankTransferPosting posting : relevant) {
			BankTransaction source = bank.get(posting.getSourceTransactionId());
			if (posting.getCanceledAt() == null) {
				if (posting.getCounterpartTransactionId() != null || !account.equals(posting.getCounterpartAccountId())) continue;
				Boolean after = afterObservation(source, observed);
				// 같은 날 시각이 없으면 은행 확인에 이체가 포함됐는지 추정하지 않습니다.
				if (after == null) return null;
				if (after) balance = balance.add("INCOME".equals(source.getDirection()) ? source.getAmount().negate() : source.getAmount());
				continue;
			}
			List<BankTransaction> actual = new ArrayList<>();
			actual.add(source);
			BankTransaction counterpart = bank.get(posting.getCounterpartTransactionId());
			if (counterpart != null) actual.add(counterpart);
			for (BankTransaction row : actual) {
				if (!account.equals(row.getBankAccountId()) || hasActiveReplacement(row, bank.values())) continue;
				Boolean after = afterObservation(row, observed);
				if (after == null) return null;
				// 은행 확인값에 이미 포함된 취소 이체만 장부에서 역방향으로 제거합니다.
				if (!after) balance = balance.add("INCOME".equals(row.getDirection()) ? row.getAmount().negate() : row.getAmount());
			}
		}
		for (BankTransferPosting posting : transferPostings.all(property)) {
			if (!posting.isManual() || posting.getManualDate().isAfter(end)
				|| (!account.equals(posting.getManualOutgoingAccountId()) && !account.equals(posting.getCounterpartAccountId()))) continue;
			boolean outgoing = account.equals(posting.getManualOutgoingAccountId());
			BigDecimal net = outgoing ? posting.getManualAmount().negate() : posting.getManualAmount();
			BankTransaction actual = bank.get(outgoing ? posting.getSourceTransactionId() : posting.getCounterpartTransactionId());
			Boolean after = actual == null ? afterManualObservation(posting.getManualDate(), posting.getCreatedAt(), observed)
				: actual.getId().equals(observed.id()) ? false : afterObservation(actual, observed);
			if (after == null) return null;
			if (posting.getCanceledAt() == null && after) balance = balance.add(net);
			if (posting.getCanceledAt() != null && actual != null && !after) balance = balance.subtract(net);
		}
		// 출처가 아니라 실제 입출금 날짜를 기준으로 최신 확인 이후의 수동 거래도 모두 반영합니다.
		// 같은 날의 마감 확인에는 당일 거래가 이미 포함되므로 중복 합산하지 않습니다.
		for (Payment receipt : receipts) {
			if (account.equals(receipt.getBankAccountId()) && receipt.getBankTransactionId() == null
			    && receipt.getLinkedPaymentId() == null && "MANUAL".equals(receipt.getSourceType())
			    && afterManualObservation(receipt.getPaymentDate(), receipt.getCreatedAt(), observed) && !receipt.getPaymentDate().isAfter(end))
				balance = balance.add(receipt.getAmount());
		}
		for (Expense expense : expenses) {
			if (account.equals(expense.getBankAccountId()) && "MANUAL".equals(expense.getSourceType())
			    && afterManualObservation(expense.getExpenseDate(), expense.getConfirmedAt(), observed) && !expense.getExpenseDate().isAfter(end))
				balance = balance.subtract(expense.getTotalAmount());
		}
		return new AccountCalculation(balance, observed.date(), "TRANSACTION_LEDGER");
	}

	private boolean hasActiveReplacement(BankTransaction original, Collection<BankTransaction> history) {
		return original.getDeletedAt() != null && history.stream().anyMatch(row -> row.getDeletedAt() == null
		    && row.getBankAccountId().equals(original.getBankAccountId()) && row.getDeduplicationKey().equals(original.getDeduplicationKey()));
	}

	/** 같은 거래일에는 확인 뒤 새로 기록한 미연결 수기 거래를 포함하고 명시한 일 마감에는 중복하지 않습니다. */
	private boolean afterManualObservation(LocalDate date, OffsetDateTime recordedAt, BankBalanceSelection.Candidate observed) {
		int compare = date.compareTo(observed.date());
		if (compare != 0) return compare > 0;
		if ("DAY_END".equals(observed.precision())) return false;
		return observed.recordedAt() != null && !recordedAt.isBefore(observed.recordedAt());
	}

	/** 확인일 마감은 당일 거래를 포함하고 시각 자료는 실제 순서만 비교합니다. */
	private Boolean afterObservation(BankTransaction source, BankBalanceSelection.Candidate observed) {
		int date = source.getTransactionDate().compareTo(observed.date());
		if (date != 0) return date > 0;
		if ("DAY_END".equals(observed.precision())) return false;
		if (source.getTransactionTime() == null || observed.time() == null) return null;
		return source.getTransactionTime().isAfter(observed.time());
	}

	/** 통장 초기 잔액에 실제 입출금을 누적·역산합니다. 동별 귀속 설정과 은행 직접 확인은 계산 기준을 바꾸지 않습니다. */
	private AccountCalculation calculateAccountBalance(UUID property, UUID account, YearMonth month, BankOpeningBalance baseline,
	    List<BankTransaction> bank, List<Payment> receipts, List<Expense> expenses) {
		// 동별 합계는 통장 전체 자금과 다를 수 있으므로 초기 잔액이 없으면 장부 잔액도 미설정으로 둡니다.
		if (baseline == null)
			return null;
		return calculateFromOpening(property, account, month, baseline.getAmount(), baseline.getCutoffDate(), bank, receipts, expenses);
	}

	/** 출처별로 돈을 재합산하지 않고 하나의 시작 금액에 유효 원본·수기·이체를 한 번씩 누적합니다. */
	private AccountCalculation calculateFromOpening(UUID property, UUID account, YearMonth month, BigDecimal opening,
		LocalDate cutoff, List<BankTransaction> bank, List<Payment> receipts, List<Expense> expenses) {
		return new AccountCalculation(BuildingCashCalculation.calculate(opening, cutoff, month,
			accountMovements(property, account, bank, receipts, expenses)).balance(), cutoff);
	}

	/** 동일한 원본·수기·이체 목록을 통장 잔고와 이체 가능액 계산에서 재사용합니다. */
	private List<BuildingCashCalculation.Movement> accountMovements(UUID property, UUID account,
		List<BankTransaction> bank, List<Payment> receipts, List<Expense> expenses) {
		ArrayList<BuildingCashCalculation.Movement> movements = new ArrayList<BuildingCashCalculation.Movement>();
		// 통장의 실제 이동은 동별 배분 여부와 무관하므로 미분류 원본·외부 지출·내부 이체도 전액 반영합니다.
		Set<UUID> canceledTransfers = new HashSet<>(transferPostings.canceledSources(property));
		canceledTransfers.addAll(transferPostings.manualSources(property));
		for (var row : bank) {
			if (canceledTransfers.contains(row.getId()) || !account.equals(row.getBankAccountId()))
				continue;
			movements.add(new BuildingCashCalculation.Movement(row.getTransactionDate(),
			    "INCOME".equals(row.getDirection()) ? row.getAmount() : BigDecimal.ZERO,
			    "EXPENSE".equals(row.getDirection()) ? row.getAmount() : BigDecimal.ZERO));
		}
		// 반대편 원본 도착 전의 자동 장부 이동만 추가합니다. 실제 원본은 위 루프에서 한 번 반영합니다.
		for (var posting : transferPostings.all(property)) {
			if (posting.isManual() || posting.getCanceledAt() != null || posting.getCounterpartTransactionId() != null
			    || !account.equals(posting.getCounterpartAccountId())) continue;
			BankTransaction source = bank.stream().filter(value -> value.getId().equals(posting.getSourceTransactionId())).findFirst().orElse(null);
			if (source == null) continue;
			movements.add(new BuildingCashCalculation.Movement(source.getTransactionDate(),
			    "EXPENSE".equals(source.getDirection()) ? source.getAmount() : BigDecimal.ZERO,
			    "INCOME".equals(source.getDirection()) ? source.getAmount() : BigDecimal.ZERO));
		}
		for (BankingResponse.Transaction row : transferPostings.manualRows(property))
			if (account.equals(row.accountId()) && "TRANSFER".equals(row.status()))
				movements.add(new BuildingCashCalculation.Movement(row.date(),
					"INCOME".equals(row.direction()) ? new BigDecimal(row.amount()) : BigDecimal.ZERO,
					"EXPENSE".equals(row.direction()) ? new BigDecimal(row.amount()) : BigDecimal.ZERO));
		// 확정한 수기 입금은 용도와 무관하게 반영하고, 은행에 연결된 입금은 원본과 중복 합산하지 않습니다.
		for (var receipt : receipts) {
			if (!account.equals(receipt.getBankAccountId()) || receipt.getBankTransactionId() != null
			    || !"MANUAL".equals(receipt.getSourceType()))
				continue;
			movements.add(
			    new BuildingCashCalculation.Movement(receipt.getPaymentDate(), receipt.getAmount(), BigDecimal.ZERO));
		}
		// 은행 미연결 수동 출금은 통장에서 전액을 한 번 차감하고 동별 원장은 위 배분액으로 계산합니다.
		for (var expense : expenses) {
			if (!"MANUAL".equals(expense.getSourceType()) || !account.equals(expense.getBankAccountId()))
				continue;
			movements.add(new BuildingCashCalculation.Movement(expense.getExpenseDate(), BigDecimal.ZERO,
			    expense.getTotalAmount()));
		}
		return movements;
	}

	/** 통장 초기 금액·날짜 정정을 확인한 동별 보유금과 함께 기록하고 필요한 부과만 반영합니다. */
	@Transactional(isolation = Isolation.READ_COMMITTED)
	public void saveAccountOpening(UUID user, UUID property, BankingBalanceRequests.AccountOpening request) {
		lock(user, property);
		if (corrections.replay(request.id(), property, user, "ACCOUNT", request))
			return;
		var repeated = bankOpenings.findById(request.id());
		if (repeated.isPresent()) {
			var saved = repeated.get();
			if (saved.getBatchId() != null || !property.equals(saved.getPropertyId())
			    || !user.equals(saved.getRecordedBy()) || !request.accountId().equals(saved.getBankAccountId())
			    || !request.cutoffDate().equals(saved.getCutoffDate()) || saved.getRevision() != request.revision() + 1
			    || saved.getAmount().compareTo(new BigDecimal(request.amount())) != 0)
				throw new PaymentException("BANK_OPENING_CONFLICT");
			return;
		}
		corrections.requireAllowed(properties.findById(property).orElseThrow());
		if (request.cutoffDate().isAfter(today()))
			throw new PaymentException("INVALID_BANK_OPENING_DATE");
		if (request.amount() == null || !request.amount().matches("[0-9]{1,15}"))
			throw new PaymentException("INVALID_BANK_OPENING");
		accounts.findById(request.accountId())
		    .filter(a -> property.equals(a.getPropertyId()) && a.getDeletedAt() == null && a.getBuildingId() == null
		        && a.getStatus() == BankAccountStatus.ACTIVE)
		    .orElseThrow(() -> new PaymentException("PAYMENT_ACCOUNT_UNAVAILABLE"));
		long revision = bankOpenings.findByPropertyIdAndBatchIdIsNullOrderByRevisionDesc(property).stream()
		    .filter(o -> o.getBankAccountId().equals(request.accountId())).mapToLong(o -> o.getRevision()).max()
		    .orElse(0);
		if (revision != request.revision())
			throw new PaymentException("BANK_OPENING_CONFLICT");
		List<BankOpeningBalance> previousRows = bankOpenings.findByPropertyIdAndBatchIdIsNullOrderByRevisionDesc(property)
		    .stream().filter(o -> o.getBankAccountId().equals(request.accountId())).toList();
		var previous = previousRows.isEmpty()
		    ? openingBatches.findByPropertyIdOrderByCreatedAtDesc(property).stream()
		        .filter(batch -> "CONFIRMED".equals(batch.getStatus())).findFirst()
		        .flatMap(batch -> bankOpenings.findByBatchId(batch.getId()).stream()
		            .filter(row -> request.accountId().equals(row.getBankAccountId())).findFirst()).orElse(null)
		    : previousRows.getFirst();
		var billingImpact = billingStart.require(user, property, request.accountId(), request.cutoffDate(),
		    request.billingToken(), request.confirmBilling());
		List<InitialBalanceCorrection.Detail> details = new ArrayList<>();
		details.add(new InitialBalanceCorrection.Detail(request.accountId(), accounts.findById(request.accountId())
		    .map(a -> a.getBankName() + " ····" + a.getAccountLast4()).orElse("통장 시작 잔액"),
		    previous == null ? null : previous.getCutoffDate(), request.cutoffDate(),
		    previous == null ? null : previous.getAmount().toPlainString(), request.amount()));
		if (billingImpact.changed() || !billingImpact.missingMonths().isEmpty())
			details.add(billingStart.detail(property, billingImpact));
		alignBuildingOpenings(user, property, request, previous, details);
		corrections.record(request.id(), property, user, "ACCOUNT", request, request.reason(),
		    previous == null ? null : previous.getCutoffDate(), request.cutoffDate(),
		    details);
		bankOpenings.saveAndFlush(BankOpeningBalance.independent(request.id(),
		    property, request.accountId(), request.cutoffDate(), new BigDecimal(request.amount()), revision + 1, user,
		    OffsetDateTime.now(clock)));
		billingStart.apply(property, request.cutoffDate(), billingImpact);
	}

	/** 통장 금액만 바꾸는 경우에도 동별 몫을 확인받고 같은 트랜잭션에서 명시한 금액만 정정합니다. */
	private void alignBuildingOpenings(UUID actor, UUID property, BankingBalanceRequests.AccountOpening request,
	    BankOpeningBalance previous, List<InitialBalanceCorrection.Detail> details) {
		List<BuildingCashOpening> saved = openings.findByPropertyId(property).stream()
		    .filter(row -> request.accountId().equals(row.getBankAccountId())).toList();
		boolean amountChanged = previous != null
		    && previous.getAmount().compareTo(new BigDecimal(request.amount())) != 0;
		if (!amountChanged && request.buildings() == null
		    && saved.stream().allMatch(row -> row.getCutoffDate().equals(request.cutoffDate())))
			return;
		// 동별 보유금을 등록하지 않은 통장에는 가상의 동이나 자동 배분을 만들지 않습니다.
		if (saved.isEmpty() && (request.buildings() == null || request.buildings().isEmpty()))
			return;
		if (request.buildings() == null || request.buildings().size() != saved.size())
			throw new PaymentException("INITIAL_BUILDING_CONFIRMATION_REQUIRED");
		Map<UUID, BankingBalanceRequests.OpeningCorrectionPart> parts = new HashMap<>();
		for (var part : request.buildings()) {
			if (parts.put(part.buildingId(), part) != null)
				throw new PaymentException("CASH_OPENING_CONFLICT");
		}
		Map<UUID, String> names = buildings.findByPropertyId(property).stream()
		    .collect(Collectors.toMap(Building::getId, Building::getName));
		List<BuildingCashOpening> changed = new ArrayList<>();
		BigDecimal buildingTotal = BigDecimal.ZERO;
		for (var row : saved) {
			var part = parts.get(row.getBuildingId());
			if (part == null || row.getRevision() != part.revision())
				throw new PaymentException("CASH_OPENING_CONFLICT");
			if (part.amount() == null || !part.amount().matches("-?[0-9]{1,15}"))
				throw new PaymentException("INVALID_CASH_OPENING");
			buildingTotal = buildingTotal.add(new BigDecimal(part.amount()));
			if (row.getCutoffDate().equals(request.cutoffDate())
			    && row.getAmount().compareTo(new BigDecimal(part.amount())) == 0)
				continue;
			changed.add(row);
			details.add(new InitialBalanceCorrection.Detail(row.getBuildingId(), names.getOrDefault(row.getBuildingId(), "동"),
			    row.getCutoffDate(), request.cutoffDate(), row.getAmount().toPlainString(), part.amount()));
		}
		// 통장 시작 금액보다 큰 동별 귀속을 저장하지 않으며 모든 검증 후에만 실제 값을 바꿉니다.
		if (buildingTotal.compareTo(new BigDecimal(request.amount())) > 0)
			throw new PaymentException("INITIAL_BUILDING_TOTAL_EXCEEDED");
		// 모든 동의 버전을 먼저 검증해 일부 동만 변경되거나 미확인 차액이 자동 귀속되지 않게 합니다.
		for (var row : changed)
			row.correct(request.cutoffDate(), parts.get(row.getBuildingId()).amount(), request.id(), actor, OffsetDateTime.now(clock));
		openings.flush();
	}

	/** 동별 보유금의 날짜를 통장 시작 잔액과 따로 변경하지 못하게 서버에서도 검사합니다. 이전 미분류 이력은 보존합니다. */
	private void requireBankCutoff(UUID property, UUID accountId, LocalDate cutoff) {
		if (accountId == null)
			return;
		var date = bankOpenings.findByPropertyIdAndBatchIdIsNullOrderByRevisionDesc(property).stream()
		    .filter(row -> accountId.equals(row.getBankAccountId())).findFirst().map(BankOpeningBalance::getCutoffDate);
		if (date.isEmpty()) {
			date = openingBatches.findByPropertyIdOrderByCreatedAtDesc(property).stream()
			    .filter(batch -> "CONFIRMED".equals(batch.getStatus())).findFirst()
			    .flatMap(batch -> bankOpenings.findByBatchId(batch.getId()).stream()
			        .filter(row -> accountId.equals(row.getBankAccountId())).findFirst())
			    .map(BankOpeningBalance::getCutoffDate);
		}
		if (date.isPresent() && !date.get().equals(cutoff))
			throw new PaymentException("CASH_OPENING_BANK_DATE_MISMATCH");
	}

	/** 통장별 기준값은 같은 관리대상의 공용 통장만 허용하며 종료 통장도 과거 값 정정에 사용할 수 있습니다. */
	private void requireOpeningAccount(UUID property, UUID accountId) {
		if (accountId == null)
			return; // 이전 인계·API의 미분류 합계는 특정 통장으로 추정하지 않습니다.
		accounts.findById(accountId)
		    .filter(a -> property.equals(a.getPropertyId()) && a.getDeletedAt() == null && a.getBuildingId() == null)
		    .orElseThrow(() -> new PaymentException("PAYMENT_ACCOUNT_UNAVAILABLE"));
	}

	/** 기준일 마감 잔고는 한 번만 등록합니다. 같은 내용 재시도와 이후 추가된 동의 최초 등록만 허용합니다. */
	@Transactional(isolation = Isolation.READ_COMMITTED)
	public void saveOpenings(UUID user, UUID property, BankingBalanceRequests.Opening request) {
		lock(user, property);
		requireBankCutoff(property, request.accountId(), request.cutoffDate());
		var cutoff = request.cutoffDate();
		if (cutoff.isAfter(today()))
			throw new PaymentException("INVALID_CASH_OPENING_DATE");
		requireOpeningAccount(property, request.accountId());
		List<BuildingCashOpening> saved = openings.findByPropertyId(property).stream()
		    .filter(o -> Objects.equals(request.accountId(), o.getBankAccountId())).toList();
		if (saved.stream().anyMatch(o -> !o.getCutoffDate().equals(cutoff)))
			throw new PaymentException("CASH_OPENING_CONFLICT");
		Map<UUID, BuildingCashOpening> byId = saved.stream()
		    .collect(Collectors.toMap(buildingCashOpening -> buildingCashOpening.getBuildingId(), o -> o));
		Set<UUID> current = buildings.findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(property).stream()
		    .filter(b -> b.getStatus() == BuildingStatus.ACTIVE).map(b -> b.getId()).collect(Collectors.toSet());
		HashSet<UUID> seen = new HashSet<UUID>();
		ArrayList<BuildingCashOpening> added = new ArrayList<BuildingCashOpening>();
		for (var part : request.buildings()) {
			if (!current.contains(part.buildingId()) || !seen.add(part.buildingId()))
				throw new PaymentException("INVALID_CASH_OPENING");
			var previous = byId.get(part.buildingId());
			if (previous != null) {
				if (previous.getAmount().compareTo(new BigDecimal(part.amount())) != 0)
					throw new PaymentException("CASH_OPENING_CONFLICT");
				continue;
			}
			added.add(BuildingCashOpening.create(property, request.accountId(), part.buildingId(), cutoff,
			    part.amount(), user, OffsetDateTime.now(clock)));
		}
		if (!current.stream().allMatch(id -> byId.containsKey(id) || seen.contains(id)))
			throw new PaymentException("INVALID_CASH_OPENING");
		var currentProperty = properties.findById(property).orElseThrow();
		// 초기 등록 트랜잭션은 운영 시작 전 동별 값을 먼저 저장합니다. 운영 중 추가만 기한을 검사합니다.
		if (!added.isEmpty() && currentProperty.getManagementStartedAt() != null)
			corrections.requireAllowed(currentProperty);
		openings.saveAllAndFlush(added);
	}

	/** 기준일과 등록된 모든 동의 마감 잔고를 함께 정정합니다. 기대 버전으로 오래된 화면의 덮어쓰기를 막습니다. */
	@Transactional(isolation = Isolation.READ_COMMITTED)
	public void correctOpenings(UUID user, UUID property, BankingBalanceRequests.OpeningCorrection request) {
		lock(user, property);
		requireOpeningAccount(property, request.accountId());
		if (corrections.replay(request.id(), property, user, "BUILDING", request))
			return;
		requireBankCutoff(property, request.accountId(), request.cutoffDate());
		corrections.requireAllowed(properties.findById(property).orElseThrow());
		List<BuildingCashOpeningChange> repeated = openingChanges.findByRequestId(request.id());
		if (!repeated.isEmpty()) {
			Map<UUID, BuildingCashOpeningChange> repeatedByBuilding = repeated.stream()
			    .collect(Collectors.toMap(buildingCashOpeningChange -> buildingCashOpeningChange.getBuildingId(), c -> c));
			Set<UUID> ids = request.buildings().stream().map(openingCorrectionPart -> openingCorrectionPart.buildingId())
			    .collect(Collectors.toSet());
			if (repeated.size() != request.buildings().size() || ids.size() != request.buildings().size())
				throw new PaymentException("CASH_OPENING_CONFLICT");
			for (var part : request.buildings()) {
				var change = repeatedByBuilding.get(part.buildingId());
				if (change == null || !property.equals(change.getPropertyId())
				    || !Objects.equals(request.accountId(), change.getBankAccountId())
				    || !request.cutoffDate().equals(change.getNewCutoffDate())
				    || change.getNewAmount().compareTo(new BigDecimal(part.amount())) != 0
				    || change.getPreviousRevision() != part.revision())
					throw new PaymentException("CASH_OPENING_CONFLICT");
			}
			return;
		}
		if (request.cutoffDate().isAfter(today()))
			throw new PaymentException("INVALID_CASH_OPENING_DATE");
		List<BuildingCashOpening> saved = openings.findByPropertyId(property).stream()
		    .filter(o -> Objects.equals(request.accountId(), o.getBankAccountId())).toList();
		Map<UUID, BuildingCashOpening> byId = saved.stream()
		    .collect(Collectors.toMap(buildingCashOpening -> buildingCashOpening.getBuildingId(), o -> o));
		if (saved.isEmpty() || request.buildings().size() != saved.size())
			throw new PaymentException("INVALID_CASH_OPENING");
		HashSet<UUID> seen = new HashSet<UUID>();
		for (var part : request.buildings()) {
			var current = byId.get(part.buildingId());
			if (current == null || !seen.add(part.buildingId()))
				throw new PaymentException("INVALID_CASH_OPENING");
			if (current.getRevision() != part.revision())
				throw new PaymentException("CASH_OPENING_CONFLICT");
		}
		Map<UUID, String> labels = buildings.findByPropertyId(property).stream()
		    .collect(Collectors.toMap(Building::getId, Building::getName));
		String accountLabel = request.accountId() == null ? "미분류 통장" : accounts.findById(request.accountId())
		    .map(a -> a.getBankName() + " ····" + a.getAccountLast4()).orElse("인계 통장");
		List<InitialBalanceCorrection.Detail> details = request.buildings().stream().map(part -> {
			var old = byId.get(part.buildingId());
			return new InitialBalanceCorrection.Detail(part.buildingId(), accountLabel + " / " + labels.getOrDefault(part.buildingId(), "동"),
			    old.getCutoffDate(), request.cutoffDate(), old.getAmount().toPlainString(), part.amount());
		}).toList();
		corrections.record(request.id(), property, user, "BUILDING", request, request.reason(),
		    saved.getFirst().getCutoffDate(), request.cutoffDate(), details);
		// 검증을 모두 마친 뒤 변경해 일부 동만 새 기준일로 남지 않게 합니다. DB가 이전 값과 수정자를 보관합니다.
		var at = OffsetDateTime.now(clock);
		for (var part : request.buildings())
			byId.get(part.buildingId()).correct(request.cutoffDate(), part.amount(), request.id(), user, at);
		openings.flush();
	}

	/** 기존 확정 수납의 과거 동은 관리자가 확인해 지정하며 현재 세대 위치로 자동 추정하지 않습니다. */
	@Transactional(isolation = Isolation.READ_COMMITTED)
	public void assignIncome(UUID user, UUID property, BankingBalanceRequests.IncomeAssignment request) {
		lock(user, property);
		var p = payments.findById(request.paymentId())
		    .filter(v -> property.equals(v.getPropertyId()) && active(v) && v.getBankTransactionId() != null)
		    .orElseThrow(() -> new PaymentException("PAYMENT_NOT_FOUND"));
		buildings.findByIdAndPropertyIdAndDeletedAtIsNull(request.buildingId(), property)
		    .filter(b -> b.getStatus() == BuildingStatus.ACTIVE)
		    .orElseThrow(() -> new PaymentException("INVALID_EXPENSE_TARGET"));
		p.assignCashBuilding(request.buildingId());
		payments.flush();
	}

	/** 실제 기타 입금의 미사용액과 외부 부담액 잔여를 함께 검증해 부분 회수·여러 건 회수를 지원합니다. */
	@Transactional(isolation = Isolation.READ_COMMITTED)
	public void settle(UUID user, UUID property, BankingBalanceRequests.Settlement request) {
		lock(user, property);
		var previous = links.findById(request.id());
		if (previous.isPresent()) {
			var p = previous.get();
			if (!property.equals(p.getPropertyId()) || !p.getAllocationId().equals(request.allocationId())
			    || !p.getPaymentId().equals(request.paymentId())
			    || p.getAmount().compareTo(new BigDecimal(request.amount())) != 0)
				throw new PaymentException("EXTERNAL_SETTLEMENT_CONFLICT");
			return;
		}
		var data = workspace(user, property, YearMonth.from(today()).toString());
		var external = data.externals().stream().filter(e -> e.id().equals(request.allocationId())).findFirst()
		    .orElseThrow(() -> new PaymentException("INVALID_EXTERNAL_SETTLEMENT"));
		if (external.excluded())
			throw new PaymentException("EXTERNAL_SETTLEMENT_EXCLUDED");
		var income = data.incomes().stream().filter(i -> i.id().equals(request.paymentId()) && "OTHER".equals(i.kind()))
		    .findFirst().orElseThrow(() -> new PaymentException("INVALID_EXTERNAL_SETTLEMENT"));
		var value = new BigDecimal(request.amount());
		if (value.signum() <= 0 || value.compareTo(new BigDecimal(external.remaining())) > 0
		    || value.compareTo(new BigDecimal(income.available())) > 0)
			throw new PaymentException("EXTERNAL_SETTLEMENT_EXCEEDED");
		links.saveAndFlush(ExternalSettlementLink.create(request.id(), property, request.allocationId(),
		    request.paymentId(), request.amount(), user, OffsetDateTime.now(clock)));
	}

	/** 정산 대상을 제외·복원하되 실제 입출금·배분액·회수액은 변경하지 않습니다. 재시도는 같은 요청 ID로 처리합니다. */
	@Transactional(isolation = Isolation.READ_COMMITTED)
	public void decideSettlement(UUID user, UUID property, BankingBalanceRequests.SettlementDecision request) {
		lock(user, property);
		var repeated = decisions.findById(request.id());
		if (repeated.isPresent()) {
			var saved = repeated.get();
			if (!property.equals(saved.getPropertyId()) || !request.allocationId().equals(saved.getAllocationId())
			    || saved.isExcluded() != request.excluded() || saved.getRevision() != request.revision() + 1)
				throw new PaymentException("EXTERNAL_SETTLEMENT_DECISION_CONFLICT");
			return;
		}
		allocations.findById(request.allocationId())
		    .filter(a -> property.equals(a.getPropertyId()) && a.getBuildingId() == null)
		    .orElseThrow(() -> new PaymentException("INVALID_EXTERNAL_SETTLEMENT"));
		var latest = decisions.findFirstByPropertyIdAndAllocationIdOrderByRevisionDesc(property,
		    request.allocationId());
		long revision = latest.map(externalSettlementDecision -> externalSettlementDecision.getRevision()).orElse(0L);
		if (revision != request.revision())
			throw new PaymentException("EXTERNAL_SETTLEMENT_DECISION_CONFLICT");
		decisions.saveAndFlush(ExternalSettlementDecision.create(request.id(), property, request.allocationId(),
		    request.excluded(), revision + 1, user, OffsetDateTime.now(clock)));
	}

}
