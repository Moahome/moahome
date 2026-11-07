package com.moahome.server.accounting.service;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import com.moahome.server.accounting.domain.AccountingTransferMatch;
import com.moahome.server.accounting.domain.ExpenseAccountingReview;
import com.moahome.server.accounting.repo.AccountingTransferMatchRepository;
import com.moahome.server.accounting.repo.ExpenseAccountingReviewRepository;
import com.moahome.server.banking.dto.BankingResponse;

@Service
public class AccountingTransferService {
	private final AccountingTransferMatchRepository matches;
	private final ExpenseAccountingReviewRepository reviews;

	public AccountingTransferService(AccountingTransferMatchRepository matches, ExpenseAccountingReviewRepository reviews) {
		this.matches = matches;
		this.reviews = reviews;
	}

	/** 최신 지출 분류에 연결된 이체만 유효하며 이전 매칭은 불변 이력으로 남깁니다. */
	public List<AccountingTransferMatch> current(UUID property) {
		Map<UUID, UUID> latest = new HashMap<>();
		for (ExpenseAccountingReview review : reviews.findByPropertyIdOrderByRevisionDesc(property))
			latest.putIfAbsent(review.getExpenseId(), review.getId());
		return matches.findByPropertyId(property).stream()
			.filter(value -> value.getReviewId().equals(latest.get(value.getExpenseId()))).toList();
	}

	/** 두 원본의 날짜·금액·서로 다른 통장·동별 소유금이 같아야 하며 세대 수납은 이체로 바꾸지 않습니다. */
	public static boolean canMatch(BankingResponse.Transaction outgoing, BankingResponse.Transaction incoming) {
		if (outgoing.expense() == null || !"EXPENSE".equals(outgoing.direction())
			|| !"CONFIRMED".equals(outgoing.status()) || !"INCOME".equals(incoming.direction())
			|| !"CONFIRMED".equals(incoming.status()) || !"OTHER".equals(incoming.receiptType())
			|| incoming.paymentId() == null || outgoing.accountId() == null || incoming.accountId() == null
			|| outgoing.accountId().equals(incoming.accountId())
			|| !outgoing.date().equals(incoming.date())
			|| new BigDecimal(outgoing.amount()).compareTo(new BigDecimal(incoming.amount())) != 0
			|| outgoing.expense().allocations().stream().anyMatch(part -> part.buildingId() == null))
			return false;
		List<BankingResponse.Allocation> incomingParts = incoming.incomeAllocation() == null
			? List.of() : incoming.incomeAllocation().allocations();
		return amounts(outgoing.expense().allocations()).equals(amounts(incomingParts));
	}

	private static Map<UUID, BigDecimal> amounts(List<BankingResponse.Allocation> parts) {
		Map<UUID, BigDecimal> result = new HashMap<>();
		for (BankingResponse.Allocation part : parts)
			result.merge(part.buildingId(), new BigDecimal(part.amount()).stripTrailingZeros(), BigDecimal::add);
		result.replaceAll((building, amount) -> amount.stripTrailingZeros());
		return result;
	}

	/** 출금 분류와 같은 트랜잭션에서 상대 입금을 연결해 한쪽만 손익에서 제외되는 중간 상태를 막습니다. */
	public void record(ExpenseAccountingReview review, UUID payment) {
		matches.saveAndFlush(AccountingTransferMatch.create(review, payment));
	}
}
