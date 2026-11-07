package com.moahome.server.banking.service;

import com.moahome.server.accounting.domain.AccountingAccount;
import com.moahome.server.accounting.repo.AccountingAccountRepository;
import com.moahome.server.accounting.service.ExpenseAccountService;
import com.moahome.server.accounting.service.AccountingTransferService;
import java.time.*;
import java.util.*;
import java.util.stream.Collectors;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.moahome.server.auth.exception.*;
import com.moahome.server.banking.domain.*;
import com.moahome.server.banking.dto.*;
import com.moahome.server.banking.repo.*;
import com.moahome.server.billing.domain.BillingCalendar;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.expense.domain.ExpenseAllocation;
import com.moahome.server.expense.repo.*;
import com.moahome.server.expense.service.ExpenseService;
import com.moahome.server.expense.domain.Expense;
import com.moahome.server.payment.domain.Payment;
import com.moahome.server.payment.dto.PaymentResponse;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.payment.repo.PaymentRepository;
import com.moahome.server.payment.service.PaymentService;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.repo.*;
import com.moahome.server.property.service.ManagementAccessService;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class BankingService {
	private final ManagementAccessService access;

	private final PropertyRepository properties;

	private final BuildingRepository buildings;

	private final BankAccountRepository accounts;

	private final BankTransferRepository transfers;

	private final BankTransactionRepository transactions;

	private final ExpenseRepository expenses;

	private final ExpenseAllocationRepository allocations;

	private final ExpenseService expenseService;
	private final BankTransferPostingService transferPostings;
	private final ExpenseAccountService expenseAccounts;
	private final AccountingAccountRepository accountingAccounts;
	private final AccountingTransferService accountingTransfers;

	private final PaymentService payments;

	private final BankTransactionReader reader;

	private final PaymentTextSecurity security;

	private final Clock clock;

	private final IncomeAllocationRepository incomeAllocations;

	private final IncomeAllocationService incomeAllocationService;

	private final PaymentRepository receiptRepository;

	public BankingService(ManagementAccessService access, PropertyRepository properties, BuildingRepository buildings,
	    BankAccountRepository accounts, BankTransactionRepository transactions, ExpenseRepository expenses,
	    ExpenseAllocationRepository allocations, ExpenseService expenseService, PaymentService payments,
	    BankTransactionReader reader, @Lazy PaymentTextSecurity security, Clock clock,
	    IncomeAllocationRepository incomeAllocations,
	    PaymentRepository receiptRepository,
	    BankTransferRepository transfers,
	    IncomeAllocationService incomeAllocationService,
	    ExpenseAccountService expenseAccounts,
	    AccountingAccountRepository accountingAccounts, BankTransferPostingService transferPostings,
	    AccountingTransferService accountingTransfers) {
		this.access = access;
		this.properties = properties;
		this.buildings = buildings;
		this.accounts = accounts;
		this.transactions = transactions;
		this.expenses = expenses;
		this.allocations = allocations;
		this.expenseService = expenseService;
		this.transferPostings = transferPostings;
		this.expenseAccounts = expenseAccounts;
		this.accountingAccounts = accountingAccounts;
		this.accountingTransfers = accountingTransfers;
		this.payments = payments;
		this.reader = reader;
		this.security = security;
		this.clock = clock;
		this.incomeAllocations = incomeAllocations;
		this.receiptRepository = receiptRepository;
		this.transfers = transfers;
		this.incomeAllocationService = incomeAllocationService;
	}

	/** 기존 수납과 같은 관리자 범위를 사용하며 조회·미리보기·저장 모두 서버에서 확인합니다. */
	private void requireManagementAccess(UUID user, UUID property) {
		access.getManagementContext(user, property);
	}

	private BankAccount account(UUID property) {
		List<BankAccount> list = accounts.findByPropertyIdAndDeletedAtIsNull(property).stream()
		    .filter(a -> a.isPrimary() && a.getBuildingId() == null && a.getStatus() == BankAccountStatus.ACTIVE)
		    .toList();
		if (list.size() != 1)
			throw new PaymentException("PAYMENT_ACCOUNT_UNAVAILABLE");
		return list.getFirst();
	}

	/** 통장 선택은 같은 관리대상의 사용 중인 계좌로 제한하고 기존 호출의 기본값만 유지합니다. */
	private BankAccount account(UUID property, UUID id) {
		if (id == null)
			return account(property);
		return accounts.findById(id)
		    .filter(a -> property.equals(a.getPropertyId()) && a.getDeletedAt() == null && a.getBuildingId() == null
		        && a.getStatus() == BankAccountStatus.ACTIVE)
		    .orElseThrow(() -> new PaymentException("PAYMENT_ACCOUNT_UNAVAILABLE"));
	}

	private LocalDate today() {
		return LocalDate.now(clock.withZone(BillingCalendar.ZONE));
	}

	/** 은행 원본이 없는 실제 수동 입금도 손익 원천에 전달하며 기초 선납 인계는 새 입금으로 만들지 않습니다. */
	public List<BankingResponse.Transaction> manualIncomeSources(UUID user, UUID property) {
		requireManagementAccess(user, property);
		PaymentResponse.Ledger ledger = payments.workspace(user, property);
		return ledger.payments().stream()
		    .filter(value -> "MANUAL".equals(value.source()) && value.bankTransactionId() == null
		        && Set.of("CONFIRMED", "OPENING").contains(value.status()))
		    .map(value -> new BankingResponse.Transaction(value.id(), value.accountId(), value.date(), null,
		        value.payer(), value.memo(), value.amount(), null, "INCOME", "", value.id(), "CONFIRMED",
		        value.unitId(), "OTHER".equals(value.receiptType()) ? value.incomeCategory()
		            : ledger.units().stream().filter(unit -> unit.id().toString().equals(value.unitId()))
		                .map(PaymentResponse.Unit::label).findFirst().orElse(""),
		        null, value.incomeAllocation(), value.receiptType(), false, null, "MANUAL"))
		    .toList();
	}

	private boolean allowed(Property target, LocalDate date) {
		return target.getBalanceCutoffDate() == null || date.isAfter(target.getBalanceCutoffDate());
	}

	/** 연결 결과로 상태를 구성하며 원본 입출금과 업무 금액을 중복 합산하지 않습니다. */
	public BankingResponse.Workspace workspace(UUID user, UUID property) {
		requireManagementAccess(user, property);
		var ledger = payments.workspace(user, property);
		Map<UUID, PaymentResponse.Payment> receipts = ledger.payments().stream()
		    .filter(p -> p.bankTransactionId() != null).collect(Collectors.toMap(
		        entry -> entry.bankTransactionId(), p -> p, (a, b) -> "CANCELED".equals(a.status()) ? b : a));
		Map<UUID, List<ExpenseAllocation>> parts = allocations.findByPropertyIdOrderBySortOrderAsc(property).stream()
		    .collect(Collectors.groupingBy(a -> a.getExpenseId()));
		HashMap<UUID, BankingResponse.Expense> expenseByTransaction = new HashMap<UUID, BankingResponse.Expense>();
		ArrayList<BankingResponse.Transaction> manualRows = new ArrayList<>();
		LinkedHashMap<String, BankingResponse.Rule> rules = new LinkedHashMap<String, BankingResponse.Rule>();
		List<BankTransaction> originals = transactions.findByPropertyId(property).stream()
		    .filter(t -> t.getDeletedAt() == null).toList();
		HashMap<UUID, UUID> transferBySource = new HashMap<UUID, UUID>();
		transfers.findByPropertyId(property).stream().filter(t -> t.getCanceledAt() == null).forEach(t -> {
			transferBySource.put(t.getOutgoingId(), t.getId());
			transferBySource.put(t.getIncomingId(), t.getId());
		});
		Map<UUID, BankTransaction> byId = originals.stream().collect(Collectors.toMap(bankTransaction -> bankTransaction.getId(), t -> t));
		Map<UUID, AccountingAccount> selectedAccounts = expenseAccounts.latest(property);
		List<AccountingAccount> sourceAccounts = accountingAccounts.findByPropertyIdOrderByCreatedAtAscIdAsc(property);
		for (var e : expenses.findByPropertyIdOrderByConfirmedAtDesc(property)) {
			List<BankingResponse.Allocation> shares = parts.getOrDefault(e.getId(), List.of()).stream()
			    .map(a -> new BankingResponse.Allocation(a.getBuildingId(),
			        security.decrypt(a.getTargetLabelEncrypted()), a.getAllocatedAmount().toPlainString(),
			        a.getPercentage() == null ? null : a.getPercentage().toPlainString()))
			    .toList();
			String category = security.decrypt(e.getCategoryEncrypted());
			var accountingAccount = selectedAccounts.get(e.getId());
			if (accountingAccount == null && e.getAccountingAccountId() != null) {
				accountingAccount = sourceAccounts.stream().filter(value -> value.getId().equals(e.getAccountingAccountId())).findFirst().orElseThrow();
			}
			if (accountingAccount == null) accountingAccount = ExpenseAccountService.match(category, sourceAccounts);
			var result = new BankingResponse.Expense(e.getId(), category,
			    security.decrypt(e.getMemoEncrypted()), e.getAllocationMode(), e.isSaveAsRule(), shares,
			    accountingAccount == null ? null : accountingAccount.getCode(),
			    accountingAccount == null ? null : accountingAccount.getName());
			if ("MANUAL".equals(e.getSourceType())) {
				manualRows.add(new BankingResponse.Transaction(e.getId(), e.getBankAccountId(), e.getExpenseDate(),
				    null, result.category(), result.note(), e.getTotalAmount().toPlainString(), null, "EXPENSE", "",
				    null, "CONFIRMED", "", "", result, null, null, false, null, "MANUAL"));
				continue;
			}
			expenseByTransaction.put(e.getBankTransactionId(), result);
			var original = byId.get(e.getBankTransactionId());
			if (e.isSaveAsRule() && original != null)
				rules.putIfAbsent(original.getBankAccountId() + ":" + e.getRuleKey(), new BankingResponse.Rule(
				    e.getRuleKey(), original.getBankAccountId(), result.category(), result.mode(), shares, result.accountCode()));
		}
		Map<UUID, List<IncomeAllocation>> allocatedIncome = incomeAllocations
		    .findByPropertyIdOrderBySortOrderAsc(property).stream()
		    .collect(Collectors.groupingBy(entry -> entry.getPaymentId()));
		List<BankingResponse.Transaction> rows = originals.stream()
		    .sorted(Comparator.comparing((BankTransaction bankTransaction) -> bankTransaction.getTransactionDate())
		        .thenComparing(t -> t.getTransactionTime() == null ? LocalTime.MIN : t.getTransactionTime()).reversed())
		    .map(t -> {
			    var payment = receipts.get(t.getId());
			    var expense = expenseByTransaction.get(t.getId());
			    String unitId = payment == null ? "" : payment.unitId();
			    String label = ledger.units().stream().filter(u -> u.id().toString().equals(unitId))
			        .map(unit -> unit.label()).findFirst().orElse("");
			    if (payment != null && "OTHER".equals(payment.receiptType()))
				    label = payment.incomeCategory();
			    return new BankingResponse.Transaction(t.getId(), t.getBankAccountId(), t.getTransactionDate(),
			        t.getTransactionTime(), security.decrypt(t.getPayerNameEncrypted()),
			        security.decrypt(t.getMemoEncrypted()), t.getAmount().toPlainString(),
			        t.getBalance() == null ? null : t.getBalance().toPlainString(), t.getDirection(),
			        BankTransactionKeys.ruleKey(security.decrypt(t.getPayerNameEncrypted()), security),
			        payment == null ? null : payment.id(),
			        t.isTransferCandidate()
			            ? (transferBySource.containsKey(t.getId()) ? "TRANSFER" : "TRANSFER_PENDING")
			            : expense != null ? "CONFIRMED" : payment == null ? "PENDING" : "OPENING".equals(payment.status()) ? "CONFIRMED" : payment.status(),
			        unitId, label, expense,
			        payment == null || !Set.of("CONFIRMED", "OPENING").contains(payment.status())
			            || !allocatedIncome.containsKey(payment.id())
			                ? null
			                : new BankingResponse.Expense(payment.id(), payment.incomeCategory(), payment.incomeNote(),
			                    allocatedIncome.get(payment.id()).getFirst().getAllocationMode(), false,
			                    allocatedIncome.get(payment.id()).stream()
			                        .map(a -> new BankingResponse.Allocation(a.getBuildingId(),
			                            security.decrypt(a.getBuildingLabelEncrypted()), a.getAmount().toPlainString(),
			                            a.getPercentage() == null ? null : a.getPercentage().toPlainString()))
			                        .toList()),
			        payment == null ? null : payment.receiptType(), t.isTransferCandidate(),
			        transferBySource.get(t.getId()));
		    }).collect(Collectors.toCollection(ArrayList::new));
		rows.addAll(manualRows);
		List<BankingResponse.Building> targets = buildings
		    .findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(property).stream()
		    .filter(b -> b.getStatus() == BuildingStatus.ACTIVE)
		    .map(b -> new BankingResponse.Building(b.getId(), b.getName())).toList();
		Map<UUID, BankAccountRepository.Usage> usage = accounts.findUsageByPropertyId(property).stream()
		    .collect(Collectors.toMap(entry -> entry.getAccountId(), item -> item));
		rows = transferPostings.decorate(property, rows);
		return new BankingResponse.Workspace(property, today(), targets,
		    ledger.units().stream().filter(unit -> unit.eligible())
		        .map(u -> new BankingResponse.Unit(u.id(), u.label(), u.residentNames())).toList(),
		    rows, List.copyOf(rules.values()), accounts.findByPropertyIdAndDeletedAtIsNull(property).stream()
		        .filter(a -> a.getBuildingId() == null).map(a -> {
			        var saved = usage.get(a.getId());
			        LocalDate firstUse = saved == null ? null : saved.getFirstUse();
			        return new BankingResponse.Account(a.getId(), a.getBankName(), a.getAccountLast4(), a.getAlias(),
			            a.isPrimary(), a.getStatus().name(), a.getBankCode(), BankImportFormat.support(a.getBankCode()),
			            a.availableFrom(firstUse), a.getValidTo(), firstUse != null);
		        }).toList(), expenseAccounts.options(property), deletionGroups(property, rows));
	}

	/** 취소 후에도 연결 식별자를 별도로 제공해 다른 통장·페이지의 상대 거래까지 함께 선택합니다. */
	private List<BankingResponse.DeletionGroup> deletionGroups(UUID property, List<BankingResponse.Transaction> rows) {
		Set<UUID> visible = rows.stream().map(BankingResponse.Transaction::id).collect(Collectors.toSet());
		Set<UUID> grouped = new HashSet<>();
		List<BankingResponse.DeletionGroup> result = new ArrayList<>();
		for (var posting : transferPostings.all(property)) {
			UUID counterpart = posting.getCounterpartTransactionId() == null ? posting.getId() : posting.getCounterpartTransactionId();
			if (!visible.contains(posting.getSourceTransactionId()) || !visible.contains(counterpart))
				continue;
			List<UUID> pair = List.of(posting.getSourceTransactionId(), counterpart);
			result.add(new BankingResponse.DeletionGroup(posting.getId(), pair, posting.getCanceledAt() == null));
			grouped.addAll(pair);
		}
		// 재연결한 원본은 최신 연결 하나에만 속합니다. 과거 취소 이력으로 다른 상대를 추가하지 않습니다.
		for (var transfer : transfers.findByPropertyId(property).stream()
			.sorted(Comparator.comparing((BankTransfer value) -> value.getCanceledAt() != null)
				.thenComparing(BankTransfer::getCreatedAt, Comparator.reverseOrder())).toList()) {
			if (!visible.contains(transfer.getOutgoingId()) || !visible.contains(transfer.getIncomingId())
				|| grouped.contains(transfer.getOutgoingId()) || grouped.contains(transfer.getIncomingId()))
				continue;
			List<UUID> pair = List.of(transfer.getOutgoingId(), transfer.getIncomingId());
			result.add(new BankingResponse.DeletionGroup(transfer.getId(), pair, transfer.getCanceledAt() == null));
			grouped.addAll(pair);
		}
		return List.copyOf(result);
	}

	/** 미리보기는 저장하지 않고 기존 입금 후보와 출금을 한 목록으로 반환합니다. 인계 이전 거래는 따로 셉니다. */
	public BankingResponse.Preview preview(UUID user, UUID property, MultipartFile file) {
		return preview(user, property, file, null);
	}

	public BankingResponse.Preview preview(UUID user, UUID property, MultipartFile file, UUID accountId) {
		requireManagementAccess(user, property);
		var account = account(property, accountId);
		var target = properties.findById(property).orElseThrow();
		List<BankTransactionReader.Row> incoming = reader.readAll(file, account.getBankCode());
		List<PaymentResponse.Payment> receiptCandidates = incoming.stream()
		    .anyMatch(r -> "INCOME".equals(r.direction()))
		        ? payments.preview(user, property, file, account.getId()).rows()
		        : List.<PaymentResponse.Payment>of();
		Map<UUID, PaymentResponse.Payment> candidates = receiptCandidates.stream()
		    .collect(Collectors.toMap(entry -> entry.id(), r -> r));
		BankTransactionDuplicates existing = new BankTransactionDuplicates(transactions.findByPropertyId(property),
		    account.getId(), security);
		Set<String> seen = new HashSet<>();
		int duplicates = 0, before = 0;
		ArrayList<BankingResponse.Transaction> rows = new ArrayList<BankingResponse.Transaction>();
		List<BankTransferPostingService.PendingTransfer> pendingTransfers = transferPostings.pendingTransfers(property);
		for (var row : incoming) {
			if (row.date().isAfter(today()))
				throw new PaymentException("INVALID_PAYMENT_DATE");
			if (!allowed(target, row.date())) {
				before++;
				continue;
			}
			String key = BankTransactionKeys.key(row, security);
			UUID id = BankTransactionKeys.previewId(key);
			if ((existing.find(row).isPresent() && !candidates.containsKey(id)) || !seen.add(key)) {
				duplicates++;
				continue;
			}
			var candidate = candidates.get(id);
			var pendingTransfer = transferPostings.pending(pendingTransfers, account.getId(), row.date(), row.direction(), row.amount());
			UUID otherAccount = pendingTransfer == null ? null : pendingTransfer.source().getBankAccountId();
			rows.add(new BankingResponse.Transaction(id, account.getId(), row.date(), row.time(), row.payer(),
			    row.memo(), row.amount().toPlainString(), row.balance() == null ? null : row.balance().toPlainString(),
			    row.direction(), BankTransactionKeys.ruleKey(row.payer(), security), null,
			    pendingTransfer != null && pendingTransfer.posting().getCanceledAt() != null ? "CANCELED" : "PENDING",
			    candidate == null ? "" : candidate.unitId(), "", null, null, null, pendingTransfer != null,
			    pendingTransfer == null ? null : pendingTransfer.posting().getId(), "BANK_IMPORT", otherAccount, pendingTransfer != null,
			    pendingTransfer == null ? List.of() : transferPostings.allocations(property, pendingTransfer.posting().getId())));
		}
		return new BankingResponse.Preview(property, rows, duplicates, before,
		    new BankingResponse.Period(
		        incoming.stream().map(entry -> entry.date()).min((localDate, next) -> localDate.compareTo(next)).orElseThrow(),
		        incoming.stream().map(entry -> entry.date()).max((localDate, next) -> localDate.compareTo(next)).orElseThrow()));
	}

	/** 선택 전체를 원본 파일로 재검증하고 같은 관리대상 잠금 안에서 수납·지출을 원자적으로 저장합니다. */
	@Transactional
	public BankingResponse.Workspace upload(UUID user, UUID property, MultipartFile file,
	    BankingRequests.Import selection) {
		requireManagementAccess(user, property);
		var target = properties.findForUnitUpdate(property)
		    .orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		requireManagementAccess(user, property);
		if (target.getManagementStartedAt() == null)
			throw new PaymentException("OPENING_BALANCE_REQUIRED");
		var account = account(property, selection.accountId());
		List<BankTransactionReader.Row> source = reader.readAll(file, account.getBankCode());
		LinkedHashMap<UUID, BankTransactionReader.Row> available = new LinkedHashMap<UUID, BankTransactionReader.Row>();
		for (var row : source) {
			if (row.date().isAfter(today()))
				throw new PaymentException("INVALID_PAYMENT_DATE");
			available.putIfAbsent(BankTransactionKeys.previewId(BankTransactionKeys.key(row, security)), row);
		}
		BankTransactionDuplicates duplicates = new BankTransactionDuplicates(transactions.findByPropertyId(property),
		    account.getId(), security);
		for (var item : selection.rows()) {
			var row = available.get(item.id());
			if (row != null)
				duplicates.find(row);
		}
		LinkedHashMap<UUID, PaymentService.BankReceiptChoice> choices = new LinkedHashMap<UUID, PaymentService.BankReceiptChoice>();
		ArrayList<BankTransactionReader.Row> income = new ArrayList<BankTransactionReader.Row>();
		HashSet<UUID> selected = new HashSet<UUID>();
		List<BankTransferPostingService.PendingTransfer> pendingTransfers = transferPostings.pendingTransfers(property);
		for (var item : selection.rows()) {
			var row = available.get(item.id());
			if (row == null || !selected.add(item.id()) || !allowed(target, row.date()))
				throw new PaymentException("INVALID_BANK_SELECTION");
			if (item.transfer()) {
				if (item.expense() != null || item.incomeAllocation() != null || item.unitId() != null
				    || item.incomeCategory() != null || item.incomeNote() != null)
					throw new PaymentException("INVALID_BANK_SELECTION");
				BankTransaction original = saveTransferSource(property, account.getId(), row, user);
				if (item.transferAccountId() != null || item.matchTransferId() != null) {
					transferPostings.record(UUID.randomUUID(), original, item.transferAccountId(), item.matchTransferId(), user, item.transferAllocations());
					pendingTransfers = transferPostings.pendingTransfers(property);
				}
				continue;
			}
			// 이미 반대편을 자동 반영한 거래를 일반 수납·지출로 다시 저장하면 중복 차감되므로 확인을 요구합니다.
			if (item.transferAccountId() != null || item.matchTransferId() != null || item.transferAllocations() != null
			    || transferPostings.pending(pendingTransfers, account.getId(), row.date(), row.direction(), row.amount()) != null)
				throw new PaymentException("BANK_TRANSFER_CONFIRM_REQUIRED");
			if ("INCOME".equals(row.direction())) {
				if (item.expense() != null || (item.unitId() != null && item.incomeCategory() != null)
				    || (item.incomeAllocation() != null && (item.unitId() != null || item.incomeCategory() == null)))
					throw new PaymentException("INVALID_BANK_SELECTION");
				income.add(row);
				choices.put(item.id(),
				    new PaymentService.BankReceiptChoice(item.unitId(), item.incomeCategory(), item.incomeNote()));
				continue;
			}
			if (item.unitId() != null || item.incomeCategory() != null || item.incomeNote() != null
			    || item.incomeAllocation() != null)
				throw new PaymentException("INVALID_BANK_SELECTION");
			String key = BankTransactionKeys.key(row, security);
			var previous = duplicates.find(row);
			BankTransaction original;
			if (previous.isPresent())
				original = previous.get();
			else {
				original = BankTransaction.create(property, account.getId(), row.date(), row.amount(),
				    security.protect(row.payer()).encrypted(), security.nameHash(row.payer()),
				    row.memo() == null ? null : security.protect(row.memo()).encrypted(), row.reference(), key, user,
				    OffsetDateTime.now(clock), row.time(), row.balance());
				original.markExpense();
				original = transactions.saveAndFlush(original);
			}
			if (item.expense() != null)
				expenseService.confirm(original, item.expense(), user);
		}
		if (!income.isEmpty())
			payments.importBankRows(user, property, income, choices, account.getId());
		for (var item : selection.rows()) {
			if (item.incomeAllocation() == null)
				continue;
			var original = new BankTransactionDuplicates(transactions.findByPropertyId(property), account.getId(),
			    security).find(available.get(item.id())).orElseThrow();
			allocateIncome(original, item.incomeAllocation(), user);
		}
		return workspace(user, property);
	}

	/** 내부 이체 선택은 자동 수납·지출 분류를 거치지 않고 은행 원본만 계좌별로 저장합니다. */
	private BankTransaction saveTransferSource(UUID property, UUID account, BankTransactionReader.Row row, UUID user) {
		var key = BankTransactionKeys.key(row, security);
		var previous = new BankTransactionDuplicates(transactions.findByPropertyId(property), account, security)
		    .find(row);
		if (previous.isPresent()) {
			if (!previous.get().isTransferCandidate())
				throw new PaymentException("BANK_TRANSFER_CONFLICT");
			return previous.get();
		}
		var original = BankTransaction.create(property, account, row.date(), row.amount(),
		    security.protect(row.payer()).encrypted(), security.nameHash(row.payer()),
		    row.memo() == null ? null : security.protect(row.memo()).encrypted(), row.reference(), key, user,
		    OffsetDateTime.now(clock), row.time(), row.balance());
		if ("EXPENSE".equals(row.direction()))
			original.markExpense();
		original.markTransferCandidate();
		return transactions.saveAndFlush(original);
	}

	/** 수동 입금처럼 과거 출금일을 허용하고 은행 확인값을 만들지 않은 채 지출·배분만 저장합니다. */
	@Transactional(isolation = Isolation.READ_COMMITTED)
	public BankingResponse.Workspace manualExpense(UUID user, UUID property, BankingRequests.ManualExpense request) {
		requireManagementAccess(user, property);
		var target = properties.findForUnitUpdate(property)
		    .orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		requireManagementAccess(user, property);
		if (target.getManagementStartedAt() == null)
			throw new PaymentException("OPENING_BALANCE_REQUIRED");
		account(property, request.accountId());
		if (request.date() == null || request.date().isAfter(today()))
			throw new PaymentException("INVALID_MANUAL_EXPENSE_DATE");
		expenseService.manual(property, request, user);
		return workspace(user, property);
	}

	/** 저장된 미분류 출금도 같은 검증과 잠금으로 확정합니다. 이미 확정된 배분은 덮어쓰지 않습니다. */
	@Transactional
	public BankingResponse.Workspace confirmExpense(UUID user, UUID property, UUID id,
	    BankingRequests.Expense request) {
		requireManagementAccess(user, property);
		properties.findForUnitUpdate(property).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		requireManagementAccess(user, property);
		var original = transactions.findById(id)
		    .filter(t -> property.equals(t.getPropertyId()) && t.getDeletedAt() == null)
		    .orElseThrow(() -> new PaymentException("BANK_TRANSACTION_NOT_FOUND"));
		expenseService.confirm(original, request, user);
		return workspace(user, property);
	}

	/** 확정 기타 입금의 전액을 실제 관리 동에 나눕니다. 외부 회수와 이중으로 사용하지 않습니다. */
	@Transactional(isolation = Isolation.READ_COMMITTED)
	public BankingResponse.Workspace confirmIncomeAllocation(UUID user, UUID property, UUID transactionId,
	    BankingRequests.Expense request) {
		requireManagementAccess(user, property);
		properties.findForUnitUpdate(property).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		requireManagementAccess(user, property);
		var original = transactions.findById(transactionId)
		    .filter(t -> property.equals(t.getPropertyId()) && t.getDeletedAt() == null)
		    .orElseThrow(() -> new PaymentException("BANK_TRANSACTION_NOT_FOUND"));
		allocateIncome(original, request, user);
		return workspace(user, property);
	}

	/** 같은 배분 재시도는 이중 저장하지 않으며 당시 동 이름·금액을 변경 불가 이력으로 남깁니다. */
	private void allocateIncome(BankTransaction original, BankingRequests.Expense request, UUID user) {
		if (original.isTransferCandidate())
			throw new PaymentException("BANK_TRANSFER_CONFLICT");
		if (!"INCOME".equals(original.getDirection()) || original.getDeletedAt() != null || request.saveAsRule())
			throw new PaymentException("INVALID_BANK_SELECTION");
		var property = original.getPropertyId();
		var receipt = receiptRepository.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(property).stream()
		    .filter(p -> original.getId().equals(p.getBankTransactionId()) && p.getDeletedAt() == null
		        && "CONFIRMED".equals(p.getStatus()) && "OTHER".equals(p.getReceiptType()))
		    .findFirst().orElseThrow(() -> new PaymentException("OTHER_INCOME_REQUIRED"));
		incomeAllocationService.allocate(receipt, request, user);
	}

	/** 한쪽 은행 원본과 상대 통장을 지정해 양쪽 장부를 원자적으로 반영합니다. 수동 입출금 생성은 받지 않습니다. */
	@Transactional(isolation = Isolation.READ_COMMITTED)
	public BankingResponse.Workspace postTransfer(UUID user, UUID property, BankingRequests.TransferFromTransaction request) {
		requireManagementAccess(user, property);
		properties.findForUnitUpdate(property).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		requireManagementAccess(user, property);
		BankTransaction source = transactions.findById(request.transactionId())
		    .filter(value -> property.equals(value.getPropertyId()) && value.getDeletedAt() == null)
		    .orElseThrow(() -> new PaymentException("BANK_TRANSACTION_NOT_FOUND"));
		transferPostings.record(request.id(), source, request.counterpartAccountId(), null, user, request.allocations());
		return workspace(user, property);
	}

	/** 기존 이체의 동별 소유금 이동을 같은 관리대상 잠금 안에서 한 번 확정합니다. */
	@Transactional(isolation = Isolation.READ_COMMITTED)
	public BankingResponse.Workspace allocateTransfer(UUID user, UUID property, UUID transfer, BankingRequests.TransferAllocations request) {
		requireManagementAccess(user, property);
		properties.findForUnitUpdate(property).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		requireManagementAccess(user, property);
		// 종전 두 원본 연결도 원본과 연결 이력을 보존하며 같은 이체 기록으로 전환합니다.
		if (transferPostings.all(property).stream().noneMatch(value -> value.getId().equals(transfer))) {
			BankTransfer previous = transfers.findById(transfer).filter(value -> property.equals(value.getPropertyId()) && value.getCanceledAt() == null)
			    .orElseThrow(() -> new PaymentException("BANK_TRANSFER_CONFLICT"));
			BankTransaction source = transferSource(property, previous.getOutgoingId());
			BankTransaction target = transferSource(property, previous.getIncomingId());
			previous.cancel(user, OffsetDateTime.now(clock));
			transfers.flush();
			transferPostings.record(transfer, source, target.getBankAccountId(), null, user, request.allocations());
			return workspace(user, property);
		}
		transferPostings.allocate(property, transfer, request.allocations(), user);
		return workspace(user, property);
	}

	/** 같은 대상의 서로 다른 통장·동일 금액·반대 방향의 대기 원본만 연결합니다. */
	@Transactional(isolation = Isolation.READ_COMMITTED)
	public BankingResponse.Workspace connectTransfer(UUID user, UUID property, BankingRequests.Transfer request) {
		requireManagementAccess(user, property);
		properties.findForUnitUpdate(property).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		requireManagementAccess(user, property);
		var previous = transfers.findById(request.id());
		if (previous.isPresent()) {
			var saved = previous.get();
			if (!property.equals(saved.getPropertyId()) || !request.outgoingId().equals(saved.getOutgoingId())
			    || !request.incomingId().equals(saved.getIncomingId()))
				throw new PaymentException("BANK_TRANSFER_CONFLICT");
			return workspace(user, property);
		}
		if (request.outgoingId().equals(request.incomingId()))
			throw new PaymentException("BANK_TRANSFER_CONFLICT");
		var outgoing = transferSource(property, request.outgoingId());
		var incoming = transferSource(property, request.incomingId());
		if (transferPostings.all(property).stream().anyMatch(value ->
		    Set.of(outgoing.getId(), incoming.getId()).contains(value.getSourceTransactionId())
		    || (value.getCounterpartTransactionId() != null && Set.of(outgoing.getId(), incoming.getId()).contains(value.getCounterpartTransactionId()))))
			throw new PaymentException("BANK_TRANSFER_CONFLICT");
		if (!"EXPENSE".equals(outgoing.getDirection()) || !"INCOME".equals(incoming.getDirection())
		    || outgoing.getBankAccountId().equals(incoming.getBankAccountId())
		    || outgoing.getAmount().compareTo(incoming.getAmount()) != 0)
			throw new PaymentException("BANK_TRANSFER_CONFLICT");
		List<BankTransfer> used = transfers.findByPropertyId(property).stream().filter(t -> t.getCanceledAt() == null)
		    .toList();
		if (used.stream()
		    .anyMatch(t -> t.getOutgoingId().equals(outgoing.getId()) || t.getIncomingId().equals(incoming.getId())))
			throw new PaymentException("BANK_TRANSFER_CONFLICT");
		transfers.saveAndFlush(BankTransfer.connect(request.id(), property, outgoing.getId(), incoming.getId(), user,
		    OffsetDateTime.now(clock)));
		return workspace(user, property);
	}

	private BankTransaction transferSource(UUID property, UUID id) {
		return transactions.findById(id)
		    .filter(t -> property.equals(t.getPropertyId()) && t.getDeletedAt() == null && t.isTransferCandidate())
		    .orElseThrow(() -> new PaymentException("BANK_TRANSFER_CONFLICT"));
	}

	/** 잘못 연결한 이체만 취소하고 원본과 연결 이력을 보존합니다. 재시도는 무효과입니다. */
	@Transactional(isolation = Isolation.READ_COMMITTED)
	public BankingResponse.Workspace cancelTransfer(UUID user, UUID property, UUID id) {
		requireManagementAccess(user, property);
		properties.findForUnitUpdate(property).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		requireManagementAccess(user, property);
		if (transferPostings.cancel(property, id, user)) return workspace(user, property);
		var transfer = transfers.findById(id).filter(t -> property.equals(t.getPropertyId()))
		    .orElseThrow(() -> new PaymentException("BANK_TRANSFER_CONFLICT"));
		transfer.cancel(user, OffsetDateTime.now(clock));
		transfers.flush();
		return workspace(user, property);
	}

	/** 선택 전체의 소속을 먼저 검증하고 연결 수납을 취소한 뒤 원본을 소프트 삭제해 재업로드를 허용합니다. */
	@Transactional(isolation = Isolation.READ_COMMITTED)
	public BankingResponse.Workspace deleteMany(UUID user, UUID property, BankingRequests.DeleteMany request) {
		requireManagementAccess(user, property);
		properties.findForUnitUpdate(property).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		requireManagementAccess(user, property);
		LinkedHashSet<UUID> requested = new LinkedHashSet<>(request.transactionIds());
		LinkedHashSet<UUID> manualIds = new LinkedHashSet<>(request.paymentIds());
		LinkedHashSet<UUID> expenseIds = new LinkedHashSet<>(request.manualExpenseIds());
		// 확정 이체는 삭제가 취소를 대신하지 않습니다. 먼저 명시적으로 연결·반영을 취소해야 합니다.
		for (var match : accountingTransfers.current(property)) {
			var outgoing = expenses.findById(match.getExpenseId()).orElseThrow();
			var incoming = receiptRepository.findById(match.getPaymentId()).orElseThrow();
			if (expenseIds.contains(outgoing.getId()) || manualIds.contains(incoming.getId())
				|| requested.contains(outgoing.getBankTransactionId()) || requested.contains(incoming.getBankTransactionId()))
				throw new PaymentException("BANK_TRANSFER_CANCEL_REQUIRED");
		}
		if (transferPostings.all(property).stream().anyMatch(value -> value.getCanceledAt() == null
			&& (requested.contains(value.getId()) || requested.contains(value.getSourceTransactionId())
				|| requested.contains(value.getCounterpartTransactionId()))))
			throw new PaymentException("BANK_TRANSFER_CANCEL_REQUIRED");
		for (var group : deletionGroups(property, workspace(user, property).rows())) {
			if (group.transactionIds().stream().noneMatch(requested::contains))
				continue;
			if (group.requiresCancellation())
				throw new PaymentException("BANK_TRANSFER_CANCEL_REQUIRED");
			if (!requested.containsAll(group.transactionIds()))
				throw new PaymentException("BANK_TRANSFER_DELETE_PAIR_REQUIRED");
		}
		LinkedHashSet<UUID> ids = new LinkedHashSet<>(transferPostings.deletionSources(property, requested));
		List<BankTransaction> selected = transactions.findAllById(ids);
		if (selected.size() != ids.size() || selected.stream().anyMatch(t -> !property.equals(t.getPropertyId())))
			throw new PaymentException("BANK_TRANSACTION_NOT_FOUND");
		// 은행 원본과 수동 수납 선택은 구분하며 다른 대상·은행 연결 수납은 수동 삭제로 우회하지 못합니다.
		List<Payment> manual = receiptRepository.findAllById(manualIds);
		if (manual.size() != manualIds.size() || manual.stream().anyMatch(p -> !property.equals(p.getPropertyId())))
			throw new PaymentException("PAYMENT_NOT_FOUND");
		if (manual.stream().anyMatch(p -> !"MANUAL".equals(p.getSourceType()) || p.getBankTransactionId() != null))
			throw new PaymentException("PAYMENT_DELETE_NOT_ALLOWED");
		List<Expense> manualExpenses = expenses.findAllById(expenseIds);
		if (manualExpenses.size() != expenseIds.size() || manualExpenses.stream()
		    .anyMatch(value -> !property.equals(value.getPropertyId()) || !"MANUAL".equals(value.getSourceType())))
			throw new PaymentException("EXPENSE_DELETE_NOT_ALLOWED");
		// 한 선택이라도 삭제 불가이면 은행 원본 취소까지 모두 롤백합니다. 취소 사유와 수납 이벤트는 보존합니다.
		if (!manualIds.isEmpty())
			payments.removeManualReceipts(user, property, manualIds);
		// 확정 수납·충당은 기존 취소 흐름과 같은 이력을 남깁니다. 출금 분류·배분은 원본과 함께 보관합니다.
		payments.removeBankReceipts(user, property, ids);
		var at = OffsetDateTime.now(clock);
		manualExpenses.forEach(value -> value.removeManual(user, at));
		expenses.flush();
		selected.forEach(t -> t.softDelete(user, at));
		transactions.flush();
		return workspace(user, property);
	}

}
