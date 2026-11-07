package com.moahome.server.accounting.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.UUID;
import java.util.List;
import java.util.ArrayList;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.moahome.server.accounting.domain.AccountingAccount;
import com.moahome.server.accounting.domain.AccountingProfile;
import com.moahome.server.accounting.domain.ExpenseAccountingReview;
import com.moahome.server.accounting.domain.IncomeGroup;
import com.moahome.server.accounting.domain.RevenueAccountingReview;
import com.moahome.server.accounting.dto.AccountingRequests;
import com.moahome.server.accounting.exception.AccountingException;
import com.moahome.server.accounting.repo.AccountingAccountRepository;
import com.moahome.server.accounting.repo.AccountingProfileRepository;
import com.moahome.server.accounting.repo.ExpenseAccountingReviewRepository;
import com.moahome.server.accounting.repo.RevenueAccountingReviewRepository;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.banking.service.BankingService;
import com.moahome.server.banking.dto.BankingResponse;
import com.moahome.server.accounting.domain.AccountingTransferMatch;
import com.moahome.server.billing.service.BillingIncomeSourceService;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.common.validation.TextValues;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.property.service.ManagementAccessService;

@Service
@Transactional
public class AccountingWriteService {
	private final ManagementAccessService access;

	private final PropertyRepository properties;
	private final AccountingProfileRepository profiles;

	private final AccountingAccountRepository accounts;
	private final ExpenseAccountingReviewRepository reviews;

	private final RevenueAccountingReviewRepository revenueReviews;
	private final BillingIncomeSourceService billing;

	private final BankingService banking;
	private final PaymentTextSecurity security;

	private final Clock clock;
	private final AccountingTransferService accountingTransfers;

	public AccountingWriteService(ManagementAccessService access, PropertyRepository properties,
		AccountingProfileRepository profiles, AccountingAccountRepository accounts,
		ExpenseAccountingReviewRepository reviews, RevenueAccountingReviewRepository revenueReviews,
		BillingIncomeSourceService billing, BankingService banking, PaymentTextSecurity security, Clock clock,
		AccountingTransferService accountingTransfers) {
		this.access = access;
		this.properties = properties;
		this.profiles = profiles;
		this.accounts = accounts;
		this.reviews = reviews;
		this.revenueReviews = revenueReviews;
		this.billing = billing;
		this.banking = banking;
		this.security = security;
		this.clock = clock;
		this.accountingTransfers = accountingTransfers;
	}

	/** 관리대상 잠금으로 초기 설정·기본 과목 생성을 직렬화하고 기존 회계 시작 기준은 덮어쓰지 않습니다. */
	public void configure(UUID actor, UUID property, AccountingRequests.Configure request) {
		requireAdminAndLock(actor, property);
		// 이전 Client의 요청도 날짜를 덮어쓰지 않고 첫 부과 기준의 자동 초기화만 수행합니다.
		ensureConfigured(actor, property);
	}

	/** 조회는 쓰지 않고 첫 분류 저장의 잠금 안에서 첫 부과 기준·기본 계정을 필요한 만큼만 저장합니다. */
	private void ensureConfigured(UUID actor, UUID property) {
		var target = properties.findById(property).orElseThrow();
		YearMonth start = billing.firstMonth(property, target.getFirstBillingMonth());
		if (start == null)
			throw new AccountingException("ACCOUNTING_BILLING_REQUIRED");
		OffsetDateTime at = OffsetDateTime.now(clock);
		if (!profiles.existsById(property))
			profiles.saveAndFlush(AccountingProfile.create(property, start, 1, actor, at));
		List<AccountingAccount> current = accounts.findByPropertyIdOrderByCreatedAtAscIdAsc(property);
		accounts.saveAllAndFlush(AccountingAccount.withDefaults(property, current, actor, at).stream()
			.filter(value -> current.stream().noneMatch(account -> account.getId().equals(value.getId()))).toList());
	}

	/** 확인 저장과 원천 변경은 같은 관리대상 잠금을 사용하며 정정은 기존 이력 대신 새 버전을 추가합니다. */
	public void reviewExpense(UUID actor, UUID property, UUID expenseId, AccountingRequests.ReviewExpense request) {
		requireAdminAndLock(actor, property);
		ensureConfigured(actor, property);
		if (request.expectedRevision() < 0)
			throw new AccountingException("INVALID_ACCOUNTING_REVIEW");
		AccountingAccount account = accounts.findById(request.accountId())
			.filter(value -> property.equals(value.getPropertyId())
				&& (value.getReportGroup().isExpense() || value.isBankTransfer()))
			.orElseThrow(() -> new AccountingException("INVALID_ACCOUNTING_ACCOUNT"));
		// 삭제된 은행 원본·수동 지출과 다른 관리대상의 원천은 현재 업무 조회와 같은 기준으로 거부합니다.
		var source = banking.workspace(actor, property).rows().stream()
			.filter(row -> row.expense() != null && expenseId.equals(row.expense().id())
				&& "EXPENSE".equals(row.direction()) && "CONFIRMED".equals(row.status()))
			.findFirst().orElseThrow(() -> new AccountingException("ACCOUNTING_SOURCE_NOT_FOUND"));
		// 별도 날짜 입력은 받지 않고 원본 지출 날짜로 매칭 월을 정합니다. 외부 몫은 미수금으로 분리합니다.
		YearMonth month = YearMonth.from(source.date());
		String reason = matchingReason(request.reason());
		ExpenseAccountingReview previous = reviews.findFirstByPropertyIdAndExpenseIdOrderByRevisionDesc(property,
			expenseId).orElse(null);
		List<AccountingTransferMatch> currentMatches = accountingTransfers.current(property);
		if (account.isBankTransfer()) {
			List<BankingResponse.Transaction> receipts = new ArrayList<>(banking.workspace(actor, property).rows());
			receipts.addAll(banking.manualIncomeSources(actor, property));
			boolean valid = receipts.stream().anyMatch(value -> value.paymentId() != null
				&& value.paymentId().equals(request.counterpartPaymentId()) && AccountingTransferService.canMatch(source, value));
			if (!valid || currentMatches.stream().anyMatch(value -> !expenseId.equals(value.getExpenseId())
				&& value.getPaymentId().equals(request.counterpartPaymentId())))
				throw new AccountingException("INVALID_ACCOUNTING_TRANSFER");
		} else if (request.counterpartPaymentId() != null) {
			throw new AccountingException("INVALID_ACCOUNTING_TRANSFER");
		}
		// 응답 유실의 같은 저장은 중복 이력을 만들지 않으며 충돌하는 다른 수정은 최신 버전 재확인을 요구합니다.
		if (previous != null && account.getId().equals(previous.getAccountId())
			&& previous.getRecognitionMonth().equals(month.atDay(1))
			&& (!account.isBankTransfer() || currentMatches.stream().anyMatch(value -> value.getReviewId().equals(previous.getId())
				&& value.getPaymentId().equals(request.counterpartPaymentId())))
			&& actor.equals(previous.getConfirmedBy()) && reason.equals(security.decrypt(previous.getReasonEncrypted())))
			return;
		// 중지 전 성공한 동일 요청의 재전송은 위에서 성공시키되 새로운 연결은 차단합니다.
		if (!account.isSelectable())
			throw new AccountingException("INVALID_ACCOUNTING_ACCOUNT");
		int revision = previous == null ? 0 : previous.getRevision();
		if (revision != request.expectedRevision())
			throw new AccountingException("ACCOUNTING_REVIEW_CONFLICT");
		ExpenseAccountingReview saved = reviews.saveAndFlush(ExpenseAccountingReview.create(property, expenseId, account, month, revision + 1,
			security.protect(reason).encrypted(), actor, OffsetDateTime.now(clock)));
		if (account.isBankTransfer())
			accountingTransfers.record(saved, request.counterpartPaymentId());
	}

	/** 코드·명칭으로 성격을 추정하지 않고 기존 동일 부과 항목의 일반 수익 여부를 관리자가 확인합니다. */
	public void reviewRevenue(UUID actor, UUID property, UUID itemId, AccountingRequests.ReviewRevenue request) {
		requireAdminAndLock(actor, property);
		ensureConfigured(actor, property);
		boolean exists = billing.get(property).stream().flatMap(source -> source.items().stream())
			.anyMatch(item -> itemId.equals(item.sourceTemplateItemId()));
		if (!exists)
			throw new AccountingException("ACCOUNTING_SOURCE_NOT_FOUND");
		String reason = matchingReason(request.reason());
		RevenueAccountingReview previous = revenueReviews
			.findFirstByPropertyIdAndSourceTemplateItemIdOrderByRevisionDesc(property, itemId).orElse(null);
		if (previous != null && previous.isRecognized() == request.recognized()
			&& actor.equals(previous.getConfirmedBy()) && reason.equals(security.decrypt(previous.getReasonEncrypted())))
			return;
		int revision = previous == null ? 0 : previous.getRevision();
		if (revision != request.expectedRevision())
			throw new AccountingException("ACCOUNTING_REVIEW_CONFLICT");
		revenueReviews.saveAndFlush(RevenueAccountingReview.create(property, itemId, request.recognized(), revision + 1,
			security.protect(reason).encrypted(), actor, OffsetDateTime.now(clock)));
	}

	/** 단순 계정 매칭에는 사용자 사유를 요구하지 않으며 기존 이력의 필수 감사 설명만 기본값으로 남깁니다. */
	private String matchingReason(String input) {
		String reason = TextValues.optional(input, 500);
		return reason == null ? "계정과목 매칭" : reason;
	}

	/** 조회 권한과 설정·회계 확인 권한을 구분하고 잠금 전에도 서버에서 현재 역할을 검사합니다. */
	private void requireAdminAndLock(UUID actor, UUID property) {
		if (access.getManagementContext(actor, property).role() != PropertyMemberRole.ADMIN)
			throw new AuthException(AuthErrorCode.ACCESS_DENIED);
		properties.findForUnitUpdate(property)
			.orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		// 잠금 대기 중 역할이 인계·해제됐을 수 있으므로 실제 저장 직전에 현재 참여를 다시 확인합니다.
		if (access.getManagementContext(actor, property).role() != PropertyMemberRole.ADMIN)
			throw new AuthException(AuthErrorCode.ACCESS_DENIED);
	}
}
