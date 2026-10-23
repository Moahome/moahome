package com.moahome.server.expense.service;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import com.moahome.server.banking.domain.BankTransaction;
import com.moahome.server.banking.dto.*;
import com.moahome.server.banking.service.BankTransactionKeys;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.common.validation.TextValues;
import com.moahome.server.expense.domain.*;
import com.moahome.server.expense.repo.*;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.property.domain.BuildingStatus;
import com.moahome.server.property.repo.BuildingRepository;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExpenseService {
	private final ExpenseRepository expenses;

	private final ExpenseAllocationRepository allocations;

	private final BuildingRepository buildings;

	private final PaymentTextSecurity security;

	private final Clock clock;

	public ExpenseService(ExpenseRepository expenses, ExpenseAllocationRepository allocations,
	    BuildingRepository buildings, @Lazy PaymentTextSecurity security, Clock clock) {
		this.expenses = expenses;
		this.allocations = allocations;
		this.buildings = buildings;
		this.security = security;
		this.clock = clock;
	}

	/** 호출자는 관리대상 잠금·권한을 먼저 확보합니다. 비용과 동별 배분을 함께 저장해 부분 확정을 막습니다. */
	@Transactional
	public void confirm(BankTransaction original, BankingRequests.Expense request, UUID actor) {
		if (original.isTransferCandidate())
			throw new PaymentException("BANK_TRANSFER_CONFLICT");
		if (!"EXPENSE".equals(original.getDirection()) || original.getDeletedAt() != null)
			throw new PaymentException("INVALID_BANK_SELECTION");
		List<Expense.Share> shares = shares(original.getPropertyId(), request);
		List<BigDecimal> amounts = Expense.allocate(original.getAmount(), request.mode(), shares);
		String category = TextValues.required(request.category(), 100), note = TextValues.optional(request.note(), 500);
		var previous = expenses.findByBankTransactionId(original.getId());
		if (previous.isPresent()) {
			var e = previous.get();
			List<ExpenseAllocation> saved = allocations.findByPropertyIdOrderBySortOrderAsc(original.getPropertyId())
			    .stream().filter(a -> e.getId().equals(a.getExpenseId())).toList();
			boolean same = category.equals(security.decrypt(e.getCategoryEncrypted()))
			    && Objects.equals(note, security.decrypt(e.getMemoEncrypted()))
			    && request.mode().equals(e.getAllocationMode()) && request.saveAsRule() == e.isSaveAsRule()
			    && saved.size() == shares.size();
			for (int i = 0; same && i < shares.size(); i++)
				same = Objects.equals(saved.get(i).getBuildingId(), shares.get(i).buildingId())
				    && security.decrypt(saved.get(i).getTargetLabelEncrypted()).equals(shares.get(i).label())
				    && saved.get(i).getAllocatedAmount().compareTo(amounts.get(i)) == 0
				    && Objects.equals(saved.get(i).getPercentage(), percentage(shares.get(i), request.mode()));
			if (!same)
				throw new PaymentException("BANK_REQUEST_CONFLICT");
			return;
		}
		var expense = expenses.saveAndFlush(Expense.create(original.getPropertyId(), original.getId(),
		    original.getBankAccountId(), original.getTransactionDate(),
		    security.protect(category).encrypted(), note == null ? null : security.protect(note).encrypted(),
		    original.getAmount(), request.mode(), request.saveAsRule(),
		    BankTransactionKeys.ruleKey(security.decrypt(original.getPayerNameEncrypted()), security), actor,
		    OffsetDateTime.now(clock)));
		ArrayList<ExpenseAllocation> parts = new ArrayList<ExpenseAllocation>();
		for (int i = 0; i < shares.size(); i++) {
			var share = shares.get(i);
			parts.add(ExpenseAllocation.create(original.getPropertyId(), expense.getId(), share.buildingId(),
			    security.protect(share.label()).encrypted(), amounts.get(i), percentage(share, request.mode()), i));
		}
		allocations.saveAllAndFlush(parts);
	}

	/** 호출자가 권한·통장·날짜·관리대상 잠금을 확보한 뒤 지출과 배분을 원자적으로 기록합니다. */
	@Transactional
	public void manual(UUID property, BankingRequests.ManualExpense request, UUID actor) {
		if (request.amount() == null || !request.amount().matches("[0-9]{1,15}")
		    || new BigDecimal(request.amount()).signum() <= 0)
			throw new PaymentException("INVALID_MANUAL_EXPENSE");
		var previous = expenses.findById(request.id());
		if (previous.isPresent()) {
			requireSameManual(previous.get(), property, request, actor);
			return;
		}
		var input = request.expense();
		List<Expense.Share> shares = shares(property, input);
		var total = new BigDecimal(request.amount());
		List<BigDecimal> amounts = Expense.allocate(total, request.mode(), shares);
		String category = TextValues.required(request.category(), 100);
		String note = TextValues.optional(request.note(), 500);
		var expense = expenses.saveAndFlush(Expense.manual(request.id(), property, request.accountId(), request.date(),
		    security.protect(category).encrypted(), note == null ? null : security.protect(note).encrypted(), total,
		    request.mode(), actor, OffsetDateTime.now(clock)));
		ArrayList<ExpenseAllocation> parts = new ArrayList<>();
		for (int i = 0; i < shares.size(); i++) {
			var share = shares.get(i);
			parts.add(ExpenseAllocation.create(property, expense.getId(), share.buildingId(),
			    security.protect(share.label()).encrypted(), amounts.get(i), percentage(share, request.mode()), i));
		}
		allocations.saveAllAndFlush(parts);
	}

	/** 같은 요청의 응답 유실 재시도는 당시 배분을 비교해 동 이름·활성 상태가 바뀌어도 중복 생성하지 않습니다. */
	private void requireSameManual(Expense saved, UUID property, BankingRequests.ManualExpense request, UUID actor) {
		List<ExpenseAllocation> parts = allocations.findByPropertyIdOrderBySortOrderAsc(property).stream()
		    .filter(a -> saved.getId().equals(a.getExpenseId())).toList();
		if (!property.equals(saved.getPropertyId()) || !"MANUAL".equals(saved.getSourceType())
		    || !actor.equals(saved.getConfirmedBy()) || !request.accountId().equals(saved.getBankAccountId())
		    || !request.date().equals(saved.getExpenseDate())
		    || saved.getTotalAmount().compareTo(new BigDecimal(request.amount())) != 0
		    || !request.mode().equals(saved.getAllocationMode())
		    || !TextValues.required(request.category(), 100).equals(security.decrypt(saved.getCategoryEncrypted()))
		    || !Objects.equals(TextValues.optional(request.note(), 500), security.decrypt(saved.getMemoEncrypted()))
		    || parts.size() != request.allocations().size())
			throw new PaymentException("BANK_REQUEST_CONFLICT");
		ArrayList<Expense.Share> shares = new ArrayList<>();
		for (int i = 0; i < parts.size(); i++) {
			var input = request.allocations().get(i);
			var part = parts.get(i);
			String label = security.decrypt(part.getTargetLabelEncrypted());
			if (!Objects.equals(input.buildingId(), part.getBuildingId())
			    || (input.buildingId() == null && !label.equals(TextValues.required(input.label(), 100))))
				throw new PaymentException("BANK_REQUEST_CONFLICT");
			shares.add(new Expense.Share(input.buildingId(), label, input.amount(), input.percentage()));
		}
		List<BigDecimal> amounts = Expense.allocate(saved.getTotalAmount(), request.mode(), shares);
		for (int i = 0; i < parts.size(); i++) {
			if (parts.get(i).getAllocatedAmount().compareTo(amounts.get(i)) != 0
			    || !Objects.equals(parts.get(i).getPercentage(), percentage(shares.get(i), request.mode())))
				throw new PaymentException("BANK_REQUEST_CONFLICT");
		}
	}

	/** 부담 동은 같은 관리대상의 활성 동만 허용하고 당시 명칭을 스냅샷으로 저장합니다. */
	private List<Expense.Share> shares(UUID property, BankingRequests.Expense request) {
		return request.allocations().stream().map(a -> {
			String label = a.buildingId() == null ? TextValues.required(a.label(), 100)
			    : buildings.findById(a.buildingId())
			        .filter(v -> property.equals(v.getPropertyId()) && v.getDeletedAt() == null
			            && v.getStatus() == BuildingStatus.ACTIVE)
			        .orElseThrow(() -> new PaymentException("INVALID_EXPENSE_TARGET")).getName();
			return new Expense.Share(a.buildingId(), label, a.amount(), a.percentage());
		}).toList();
	}

	private BigDecimal percentage(Expense.Share share, String mode) {
		return "RATIO".equals(mode) ? new BigDecimal(share.percentage()).setScale(2) : null;
	}
}
