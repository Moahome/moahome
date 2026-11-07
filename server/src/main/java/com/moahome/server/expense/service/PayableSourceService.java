package com.moahome.server.expense.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import com.moahome.server.expense.domain.Expense;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.expense.domain.PayableSettlement;
import com.moahome.server.expense.dto.PayableResponse;
import com.moahome.server.expense.repo.ExpenseRepository;
import com.moahome.server.expense.repo.PayableExpenseRepository;
import com.moahome.server.expense.repo.PayableSettlementRepository;

@Service
@Transactional(readOnly = true)
public class PayableSourceService {
	private final PayableExpenseRepository payables;
	private final PayableSettlementRepository settlements;
	private final ExpenseRepository expenses;
	private final PaymentTextSecurity security;

	public PayableSourceService(PayableExpenseRepository payables, PayableSettlementRepository settlements,
		ExpenseRepository expenses, @Lazy PaymentTextSecurity security) {
		this.payables = payables;
		this.settlements = settlements;
		this.expenses = expenses;
		this.security = security;
	}

	/** 호출자가 확인한 관리대상의 발생·지급 감사 이력을 한 번 읽고 활성 연결만 잔액에 반영합니다. */
	public List<PayableResponse.Item> items(UUID property) {
		List<PayableSettlement> links = settlements.findByPropertyId(property);
		Map<UUID, Expense> sources = expenses.findAllById(links.stream().map(PayableSettlement::getExpenseId).distinct().toList())
			.stream().collect(Collectors.toMap(Expense::getId, value -> value));
		return payables.findByPropertyIdOrderByOccurredDateDescCreatedAtDesc(property).stream().map(value -> {
			List<PayableResponse.Settlement> payments = links.stream().filter(link -> value.getId().equals(link.getPayableId()))
				.map(link -> {
					Expense expense = sources.get(link.getExpenseId());
					if (expense == null) throw new IllegalStateException("Missing payable expense source");
					return new PayableResponse.Settlement(link.getId(), link.getExpenseId(), link.getPaymentDate(),
						link.getAmount().toPlainString(), link.getStatus(), "/banking/transactions/"
							+ (expense.getBankTransactionId() == null ? expense.getId() : expense.getBankTransactionId()));
				}).toList();
			BigDecimal paid = payments.stream().filter(link -> "ACTIVE".equals(link.status()))
				.map(link -> new BigDecimal(link.amount())).reduce(BigDecimal.ZERO, BigDecimal::add);
			return new PayableResponse.Item(value.getId(), value.getOccurredDate(), security.decrypt(value.getNameEncrypted()),
				security.decrypt(value.getCounterpartyEncrypted()), security.decrypt(value.getMemoEncrypted()),
				value.getExpenseAccountId(), value.getPayableAccountId(), value.getBuildingId(), value.getAmount().toPlainString(),
				paid.toPlainString(), ("CANCELED".equals(value.getStatus()) ? BigDecimal.ZERO : value.getAmount().subtract(paid)).toPlainString(), value.getStatus(), payments);
		}).toList();
	}

	/** 이미 발생 비용으로 인식한 지급 원본은 손익에서 재인식하지 않도록 같은 연결 ID 집합을 공유합니다. */
	public Set<UUID> paidExpenseIds(UUID property) {
		return settlements.findByPropertyId(property).stream().filter(value -> "ACTIVE".equals(value.getStatus()))
			.map(PayableSettlement::getExpenseId).collect(Collectors.toUnmodifiableSet());
	}
}
