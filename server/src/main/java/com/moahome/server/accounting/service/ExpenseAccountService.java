package com.moahome.server.accounting.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.stereotype.Service;
import com.moahome.server.accounting.domain.*;
import com.moahome.server.accounting.dto.ExpenseAccountOption;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.accounting.repo.*;

@Service
public class ExpenseAccountService {

	private final AccountingAccountRepository accounts;
	private final ExpenseAccountingReviewRepository reviews;
	private final Clock clock;

	public ExpenseAccountService(AccountingAccountRepository accounts, ExpenseAccountingReviewRepository reviews,
	    Clock clock) {
		this.accounts = accounts;
		this.reviews = reviews;
		this.clock = clock;
	}

	/** 조회만으로 DB를 변경하지 않고 기본 비용·해당 대상의 추가 과목을 코드순으로 제공합니다. */
	public List<ExpenseAccountOption> options(UUID property) {
		Map<String, ExpenseAccountOption> result = new TreeMap<>();
		Arrays.stream(DefaultAccount.values()).filter(value -> value.getGroup().isExpense())
		    .forEach(value -> result.put(value.getCode(), new ExpenseAccountOption(value.getCode(), value.getName())));
		accounts.findByPropertyIdOrderByCreatedAtAscIdAsc(property).stream()
		    .filter(value -> value.getReportGroup().isExpense())
		    .forEach(value -> result.put(value.getCode(), new ExpenseAccountOption(value.getCode(), value.getName())));
		return List.copyOf(result.values());
	}

	/** 지출 등록의 관리대상 잠금 안에서 선택 코드를 실제 계정 ID로 연결하고 시작 월은 자동 설정하지 않습니다. */
	public UUID select(UUID property, String code, UUID actor) {
		if (code == null || code.isBlank()) return null;
		AccountingAccount account = accounts.findByPropertyIdOrderByCreatedAtAscIdAsc(property).stream()
		    .filter(value -> value.getCode().equals(code) && value.getReportGroup().isExpense()).findFirst().orElse(null);
		if (account != null) return account.getId();
		DefaultAccount value = Arrays.stream(DefaultAccount.values())
		    .filter(item -> item.getGroup().isExpense() && item.getCode().equals(code)).findFirst()
		    .orElseThrow(() -> new PaymentException("INVALID_ACCOUNTING_ACCOUNT"));
		return accounts.saveAndFlush(AccountingAccount.create(property, value.getCode(), value.getName(),
		    value.getGroup(), value.getSystemKey(), actor, OffsetDateTime.now(clock))).getId();
	}

	/** 응답 유실 재시도는 현재 회계 정정값이 아닌 지출에 보존한 최초 선택을 비교합니다. */
	public void requireSameInitial(UUID property, UUID accountId, String code) {
		String previous = accountId == null ? null : accounts.findById(accountId)
		    .filter(value -> property.equals(value.getPropertyId())).orElseThrow().getCode();
		if (!Objects.equals(previous, code == null || code.isBlank() ? null : code))
			throw new PaymentException("BANK_REQUEST_CONFLICT");
	}

	/** 최신 명시적 매칭을 일괄 조회해 통장·지출 조회와 손익이 같은 과목을 표시하게 합니다. */
	public Map<UUID, AccountingAccount> latest(UUID property) {
		Map<UUID, AccountingAccount> byId = new HashMap<>();
		accounts.findByPropertyIdOrderByCreatedAtAscIdAsc(property).forEach(value -> byId.put(value.getId(), value));
		Map<UUID, AccountingAccount> result = new HashMap<>();
		for (ExpenseAccountingReview review : reviews.findByPropertyIdOrderByRevisionDesc(property)) {
			AccountingAccount account = byId.get(review.getAccountId());
			if (account != null) result.putIfAbsent(review.getExpenseId(), account);
		}
		return result;
	}

	/** 명시적 선택이 없을 때만 기존 코드·이름 자동 매칭을 사용하며 복수 후보를 임의 선택하지 않습니다. */
	public static AccountingAccount match(String category, List<AccountingAccount> source) {
		if (category == null) return null;
		String normalized = category.replaceAll("(?U)\\s+", "");
		List<AccountingAccount> exact = source.stream().filter(value -> value.getReportGroup().isExpense())
		    .filter(value -> value.getCode().equals(normalized)
		        || value.getName().replaceAll("(?U)\\s+", "").equals(normalized)).toList();
		if (exact.size() > 1) return null;
		if (exact.size() == 1) return exact.getFirst();
		return DefaultAccount.matchExpense(category).flatMap(value -> source.stream()
		    .filter(account -> account.getReportGroup().isExpense() && value.getCode().equals(account.getCode()))
		    .findFirst()).orElse(null);
	}

}
