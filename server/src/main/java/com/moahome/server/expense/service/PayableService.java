package com.moahome.server.expense.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import com.moahome.server.accounting.domain.AccountingAccount;
import com.moahome.server.accounting.domain.DefaultAccount;
import com.moahome.server.accounting.exception.AccountingException;
import com.moahome.server.accounting.repo.AccountingAccountRepository;
import com.moahome.server.accounting.service.ExpenseAccountService;
import com.moahome.server.banking.dto.BankingResponse;
import com.moahome.server.banking.service.BankingService;
import com.moahome.server.billing.domain.BillingCalendar;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.common.validation.TextValues;
import com.moahome.server.expense.domain.PayableExpense;
import com.moahome.server.expense.domain.PayableSettlement;
import com.moahome.server.expense.dto.PayableRequests;
import com.moahome.server.expense.dto.PayableResponse;
import com.moahome.server.expense.repo.ExpenseRepository;
import com.moahome.server.expense.repo.PayableExpenseRepository;
import com.moahome.server.expense.repo.PayableSettlementRepository;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.domain.BuildingStatus;
import com.moahome.server.property.repo.BuildingRepository;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.property.service.ManagementWriteAccess;

@Service
public class PayableService {
	private final ManagementAccessService access;
	private final PropertyRepository properties;
	private final BuildingRepository buildings;
	private final AccountingAccountRepository accounts;
	private final PayableExpenseRepository payables;
	private final PayableSettlementRepository settlements;
	private final ExpenseRepository expenses;
	private final BankingService banking;
	private final PayableSourceService source;
	private final PaymentTextSecurity security;
	private final Clock clock;

	public PayableService(ManagementAccessService access, PropertyRepository properties, BuildingRepository buildings,
		AccountingAccountRepository accounts, PayableExpenseRepository payables, PayableSettlementRepository settlements,
		ExpenseRepository expenses, BankingService banking, PayableSourceService source,
		@Lazy PaymentTextSecurity security, Clock clock) {
		this.access = access;
		this.properties = properties;
		this.buildings = buildings;
		this.accounts = accounts;
		this.payables = payables;
		this.settlements = settlements;
		this.expenses = expenses;
		this.banking = banking;
		this.source = source;
		this.security = security;
		this.clock = clock;
	}

	/** 조회는 ADMIN·MANAGER에게 허용하고 실제 확정 출금 중 미연결 비용만 지급 후보로 제공합니다. */
	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	public PayableResponse.Workspace workspace(UUID actor, UUID property) {
		var context = access.getManagementContext(actor, property);
		var target = properties.findById(property).orElseThrow();
		List<AccountingAccount> all = availableAccounts(property, actor);
		Set<UUID> linked = source.paidExpenseIds(property);
		List<PayableResponse.Candidate> candidates = new ArrayList<>();
		for (BankingResponse.Transaction row : banking.workspace(actor, property).rows()) {
			if (!"CONFIRMED".equals(row.status()) || !"EXPENSE".equals(row.direction()) || row.expense() == null
				|| linked.contains(row.expense().id()))
				continue;
			var expense = row.expense();
			AccountingAccount account = all.stream().filter(value -> value.getCode().equals(expense.accountCode()))
				.findFirst().orElseGet(() -> expense.accountResolved() ? null : ExpenseAccountService.match(expense.category(), all));
			if (account == null || !account.getReportGroup().isExpense())
				continue;
			// 한 동의 원본 지출 전액만 연결합니다. 다른 동·외부 몫을 임의로 재배분하지 않습니다.
			UUID building = null;
			if (target.isHasBuildings()) {
				if (expense.allocations().size() != 1 || expense.allocations().getFirst().buildingId() == null
					|| new BigDecimal(expense.allocations().getFirst().amount()).compareTo(new BigDecimal(row.amount())) != 0)
					continue;
				building = expense.allocations().getFirst().buildingId();
			}
			candidates.add(new PayableResponse.Candidate(expense.id(), row.date(), expense.category(), row.amount(),
				account.getId(), building, "/banking/transactions/" + row.id()));
		}
		return new PayableResponse.Workspace(property, target.isHasBuildings(), context.role() == PropertyMemberRole.ADMIN,
			all.stream().filter(account -> account.getDeletedAt() == null && account.getReportGroup().isExpense()).map(account ->
				new PayableResponse.Account(account.getId(), account.getCode(), account.getName(), account.isSelectable())).toList(),
			buildings.findByPropertyId(property).stream().map(building ->
				new PayableResponse.Building(building.getId(), building.getName(), building.getDeletedAt() == null
					&& building.getStatus() == BuildingStatus.ACTIVE)).toList(), source.items(property), candidates);
	}

	/** 발생 비용과 미지급금만 저장하며 같은 요청 ID의 재시도는 원본을 덮어쓰지 않습니다. */
	@Transactional
	public void create(UUID actor, UUID property, PayableRequests.Create request) {
		lock(actor, property);
		String name = TextValues.required(request.name(), 100);
		String counterparty = TextValues.required(request.counterparty(), 100);
		String memo = TextValues.optional(request.memo(), 500);
		if (request.date() == null || request.date().isAfter(LocalDate.now(clock.withZone(BillingCalendar.ZONE)))
			|| request.amount() == null || !request.amount().matches("[0-9]{1,15}")
			|| new BigDecimal(request.amount()).signum() <= 0)
			throw new AccountingException("INVALID_PAYABLE_REQUEST");
		PayableExpense previous = payables.findById(request.id()).orElse(null);
		if (previous != null) {
			if (!property.equals(previous.getPropertyId()) || !request.accountId().equals(previous.getExpenseAccountId())
				|| !Objects.equals(request.buildingId(), previous.getBuildingId()) || !request.date().equals(previous.getOccurredDate())
				|| new BigDecimal(request.amount()).compareTo(previous.getAmount()) != 0
				|| !name.equals(security.decrypt(previous.getNameEncrypted()))
				|| !counterparty.equals(security.decrypt(previous.getCounterpartyEncrypted()))
				|| !Objects.equals(memo, security.decrypt(previous.getMemoEncrypted())))
				throw new AccountingException("PAYABLE_REQUEST_CONFLICT");
			return;
		}
		List<AccountingAccount> all = availableAccounts(property, actor);
		AccountingAccount expense = all.stream().filter(value -> value.getId().equals(request.accountId())
			&& value.isSelectable() && value.getReportGroup().isExpense()).findFirst()
			.orElseThrow(() -> new AccountingException("INVALID_ACCOUNTING_ACCOUNT"));
		var target = properties.findById(property).orElseThrow();
		if (target.isHasBuildings()) {
			buildings.findByIdAndPropertyIdAndDeletedAtIsNull(request.buildingId(), property)
				.filter(value -> value.getStatus() == BuildingStatus.ACTIVE)
				.orElseThrow(() -> new AccountingException("INVALID_ACCOUNTING_BUILDING"));
		} else if (request.buildingId() != null) {
			throw new AccountingException("INVALID_ACCOUNTING_BUILDING");
		}
		// 기본 과목은 기존의 결정적 ID로 필요한 항목만 저장하며 회계 시작 기준을 임의로 만들지 않습니다.
		List<AccountingAccount> saved = accounts.findByPropertyIdOrderByCreatedAtAscIdAsc(property);
		accounts.saveAllAndFlush(all.stream().filter(value -> saved.stream().noneMatch(old -> old.getId().equals(value.getId()))).toList());
		UUID payableAccount = all.stream().filter(value -> DefaultAccount.PAYABLE.getSystemKey().equals(value.getSystemKey()))
			.findFirst().orElseThrow().getId();
		payables.saveAndFlush(PayableExpense.create(request.id(), property, expense.getId(), payableAccount,
			request.buildingId(), request.date(), security.protect(name).encrypted(), security.protect(counterparty).encrypted(),
			memo == null ? null : security.protect(memo).encrypted(), new BigDecimal(request.amount()), actor, OffsetDateTime.now(clock)));
	}

	/** 같은 관리대상 잠금 안에서 중복 출금·잔액 초과·과목/동 불일치를 검사해 부분 지급을 직렬화합니다. */
	@Transactional
	public void settle(UUID actor, UUID property, UUID payableId, PayableRequests.Settle request) {
		lock(actor, property);
		PayableExpense payable = require(property, payableId);
		PayableSettlement previous = settlements.findById(request.id()).orElse(null);
		if (previous != null) {
			if (!property.equals(previous.getPropertyId()) || !payableId.equals(previous.getPayableId())
				|| !request.expenseId().equals(previous.getExpenseId()))
				throw new AccountingException("PAYABLE_REQUEST_CONFLICT");
			return;
		}
		if (!"REGISTERED".equals(payable.getStatus()))
			throw new AccountingException("PAYABLE_CANCELED");
		PayableResponse.Candidate candidate = workspace(actor, property).candidates().stream()
			.filter(value -> request.expenseId().equals(value.expenseId()) && payable.getExpenseAccountId().equals(value.accountId())
				&& Objects.equals(payable.getBuildingId(), value.buildingId()) && !value.date().isBefore(payable.getOccurredDate()))
			.findFirst().orElseThrow(() -> new AccountingException("INVALID_PAYABLE_PAYMENT"));
		if (new BigDecimal(candidate.amount()).compareTo(payable.getAmount().subtract(paid(property, payableId))) > 0)
			throw new AccountingException("PAYABLE_PAYMENT_EXCEEDS_REMAINING");
		var expense = expenses.findById(candidate.expenseId()).filter(value -> property.equals(value.getPropertyId())
			&& value.getDeletedAt() == null).orElseThrow(() -> new AccountingException("INVALID_PAYABLE_PAYMENT"));
		settlements.saveAndFlush(PayableSettlement.create(request.id(), payable, expense, actor, OffsetDateTime.now(clock)));
	}

	/** 지급 연결만 해제하며 같은 취소 재요청은 기존 취소 감사 정보를 유지합니다. */
	@Transactional
	public void cancelPayment(UUID actor, UUID property, UUID payableId, UUID paymentId) {
		lock(actor, property);
		require(property, payableId);
		PayableSettlement value = settlements.findById(paymentId).filter(link -> property.equals(link.getPropertyId())
			&& payableId.equals(link.getPayableId())).orElseThrow(() -> new AccountingException("PAYABLE_NOT_FOUND"));
		value.cancel(actor, OffsetDateTime.now(clock));
		settlements.flush();
	}

	@Transactional
	public void cancel(UUID actor, UUID property, UUID payableId) {
		lock(actor, property);
		require(property, payableId).cancel(paid(property, payableId), actor, OffsetDateTime.now(clock));
		payables.flush();
	}

	private List<AccountingAccount> availableAccounts(UUID property, UUID actor) {
		return AccountingAccount.withDefaults(property, accounts.findByPropertyIdOrderByCreatedAtAscIdAsc(property),
			actor, OffsetDateTime.now(clock));
	}

	private PayableExpense require(UUID property, UUID id) {
		return payables.findById(id).filter(value -> property.equals(value.getPropertyId()))
			.orElseThrow(() -> new AccountingException("PAYABLE_NOT_FOUND"));
	}

	private BigDecimal paid(UUID property, UUID payableId) {
		return settlements.findByPropertyId(property).stream().filter(value -> payableId.equals(value.getPayableId())
			&& "ACTIVE".equals(value.getStatus())).map(PayableSettlement::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
	}

	/** 회계 변경은 ADMIN만 허용하고 잠금 이후에도 현재 역할을 다시 확인합니다. */
	private void lock(UUID actor, UUID property) {
		ManagementWriteAccess.requireAdminAndLock(access, properties, actor, property);
	}
}
