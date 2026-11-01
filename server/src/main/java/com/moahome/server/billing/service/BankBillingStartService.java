package com.moahome.server.billing.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.moahome.server.banking.domain.*;
import com.moahome.server.banking.repo.*;
import com.moahome.server.billing.domain.*;
import com.moahome.server.billing.dto.*;
import com.moahome.server.billing.exception.BillingException;
import com.moahome.server.billing.repo.*;
import com.moahome.server.expense.repo.ExpenseRepository;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.payment.repo.PaymentRepository;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.property.service.ManagementAccessService;

/** 기본 관리 통장의 초기 기준일과 공통 관리비 부과 시작을 같은 잠금·트랜잭션에서 맞춥니다. */
@Service
@Transactional(readOnly = true)
public class BankBillingStartService {
	private final PropertyRepository properties;
	private final BankAccountRepository accounts;
	private final BankOpeningBalanceRepository bankOpenings;
	private final OpeningBalanceBatchRepository batches;
	private final OpeningBalanceItemRepository items;
	private final ChargeRepository charges;
	private final BillingPeriodRepository periods;
	private final PaymentRepository payments;
	private final CreditApplicationRepository creditApplications;
	private final BankTransactionRepository transactions;
	private final ExpenseRepository expenses;
	private final BillingGenerationService generation;
	private final InitialBalanceCorrections corrections;
	private final ManagementAccessService access;
	private final Clock clock;

	public BankBillingStartService(PropertyRepository properties, BankAccountRepository accounts,
	    BankOpeningBalanceRepository bankOpenings, OpeningBalanceBatchRepository batches,
	    OpeningBalanceItemRepository items, ChargeRepository charges, BillingPeriodRepository periods,
	    PaymentRepository payments, BankTransactionRepository transactions, ExpenseRepository expenses,
	    BillingGenerationService generation, InitialBalanceCorrections corrections, ManagementAccessService access,
	    Clock clock, CreditApplicationRepository creditApplications) {
		this.properties = properties;
		this.accounts = accounts;
		this.bankOpenings = bankOpenings;
		this.batches = batches;
		this.items = items;
		this.charges = charges;
		this.periods = periods;
		this.payments = payments;
		this.transactions = transactions;
		this.expenses = expenses;
		this.generation = generation;
		this.corrections = corrections;
		this.access = access;
		this.clock = clock;
		this.creditApplications = creditApplications;
	}

	/** 금액 정정 중에는 청구를 변경하지 않고 날짜를 바꿀 때만 누락 월과 기존 확정 이력을 검사합니다. */
	public BankBillingImpact preview(UUID actor, UUID propertyId, UUID accountId, LocalDate cutoff) {
		access.getManagementContext(actor, propertyId);
		var property = properties.findById(propertyId).orElseThrow();
		if (cutoff == null || cutoff.isAfter(LocalDate.now(clock.withZone(BillingCalendar.ZONE))))
			throw new PaymentException("INVALID_INITIAL_BALANCE_DATE");
		var account = accounts.findByPropertyIdAndDeletedAtIsNull(propertyId).stream()
		    .filter(a -> accountId == null ? a.isPrimary() : a.getId().equals(accountId))
		    .filter(a -> a.getBuildingId() == null && a.getStatus() == BankAccountStatus.ACTIVE)
		    .findFirst().orElseThrow(() -> new PaymentException("PAYMENT_ACCOUNT_UNAVAILABLE"));
		String previousMonth = BillingCalendar.firstMonth(property).toString();
		LocalDate previousDate = property.getBalanceCutoffDate();
		if (accountId != null) {
			previousDate = bankOpenings.findByPropertyIdAndBatchIdIsNullOrderByRevisionDesc(propertyId).stream()
			    .filter(row -> row.getBankAccountId().equals(accountId)).findFirst()
			    .map(BankOpeningBalance::getCutoffDate).orElse(previousDate);
		}
		boolean dateChanged = !Objects.equals(previousDate, cutoff);
		YearMonth next = account.isPrimary() && dateChanged
		    ? BillingCalendar.firstMonthFromCutoff(cutoff) : YearMonth.parse(previousMonth);
		boolean changed = !next.toString().equals(previousMonth);
		List<BankBillingImpact.Month> missing = new ArrayList<>();
		String blocked = null;
		if (!corrections.allowed(property))
			blocked = "INITIAL_BALANCE_LOCKED";
		if (account.isPrimary() && dateChanged && blocked == null) {
			// 기존 입출금이 시작 잔액에 포함되는지 바뀌면 재충당하지 않고 정정 자체를 거부합니다.
			LocalDate ledgerCutoff = property.getBalanceCutoffDate() == null ? LocalDate.MIN : property.getBalanceCutoffDate();
			if ((
			    transactions.findByPropertyId(propertyId).stream().anyMatch(t -> crosses(t.getTransactionDate(), ledgerCutoff, cutoff))
			    || payments.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(propertyId).stream()
			        .anyMatch(p -> crosses(p.getPaymentDate(), ledgerCutoff, cutoff))
			    || expenses.findByPropertyIdOrderByConfirmedAtDesc(propertyId).stream()
			        .anyMatch(e -> crosses(e.getExpenseDate(), ledgerCutoff, cutoff))))
				blocked = "INITIAL_BALANCE_TRANSACTION_CONFLICT";
			if (changed && payments.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(propertyId).stream()
			    .anyMatch(p -> p.getDeletedAt() == null && "CONFIRMED".equals(p.getStatus())))
				blocked = "INITIAL_BILLING_HAS_RECEIPTS";
			// 이미 쓴 인계 선납을 과거 신규 청구로 다시 돌리면 기존 월의 충당 근거와 누적 표시가 달라집니다.
			if (changed && creditApplications.findByPropertyId(propertyId).stream()
			    .anyMatch(application -> "ACTIVE".equals(application.getStatus())))
				blocked = "INITIAL_BILLING_HAS_APPLICATIONS";
			List<BillingPeriod> existing = periods.findByPropertyIdOrderByBillingYearDescBillingMonthDesc(propertyId);
			if (next.isAfter(YearMonth.parse(previousMonth)) && existing.stream().anyMatch(p -> p.month().isBefore(next)))
				blocked = "INITIAL_BILLING_HAS_CHARGES";
			Set<YearMonth> issued = existing.stream().map(BillingPeriod::month).collect(Collectors.toSet());
			if (blocked == null) {
				try {
					for (YearMonth month = next; !month.isAfter(BillingCalendar.currentMonth(clock)); month = month.plusMonths(1)) {
						if (!issued.contains(month))
							missing.add(generation.preview(propertyId, month));
					}
				} catch (BillingException failure) {
					blocked = "INITIAL_BILLING_SETTINGS_REQUIRED";
					missing.clear();
				}
			}
		}
		// 확인 이후 세대 수·금액·부과 상태·기본 통장·기한이 달라지면 같은 동의로 저장하지 않습니다.
		String token = fingerprint(propertyId + ":" + account.getId() + ":" + account.isPrimary() + ":"
		    + previousDate + ":" + cutoff + ":" + previousMonth + ":" + next + ":" + missing + ":" + blocked);
		return new BankBillingImpact(account.isPrimary(), dateChanged, changed, previousMonth, next.toString(),
		    List.copyOf(missing), blocked, token);
	}

	/** 호출자가 관리대상을 잠근 뒤 미리보기와 명시적 동의를 다시 검증합니다. 실패하면 잔고도 저장하지 않습니다. */
	public BankBillingImpact require(UUID actor, UUID property, UUID account, LocalDate cutoff, String token,
	    boolean confirmed) {
		var impact = preview(actor, property, account, cutoff);
		if (impact.blockedReason() != null)
			throw new PaymentException(impact.blockedReason());
		if ((impact.changed() || !impact.missingMonths().isEmpty())
		    && (!confirmed || !impact.token().equals(token)))
			throw new PaymentException("INITIAL_BILLING_CONFIRMATION_REQUIRED");
		return impact;
	}

	/** 초기 날짜·첫 부과월·필요한 청구를 함께 저장합니다. 기존 월별 청구·수납 금액은 덮어쓰지 않습니다. */
	@Transactional
	public void apply(UUID propertyId, LocalDate cutoff, BankBillingImpact impact) {
		if (!impact.primary() || !impact.dateChanged())
			return;
		var property = properties.findById(propertyId).orElseThrow();
		YearMonth first = YearMonth.parse(impact.nextMonth());
		property.correctInitialStart(cutoff, first, OffsetDateTime.now(clock));
		for (var batch : batches.findByPropertyIdOrderByCreatedAtDesc(propertyId)) {
			if (!"CONFIRMED".equals(batch.getStatus()))
				continue;
			batch.correctInitialStart(cutoff, first);
			for (var item : items.findByBatchId(batch.getId())) {
				if (item.getChargeId() != null)
					charges.findById(item.getChargeId()).orElseThrow().correctOpeningDate(cutoff);
			}
		}
		properties.flush();
		batches.flush();
		charges.flush();
		for (var month : impact.missingMonths())
			generation.generateInitial(propertyId, YearMonth.parse(month.month()));
	}

	/** 청구 변경 근거도 초기 잔고 전후 값과 같은 불변 감사 이력에 보관합니다. */
	public InitialBalanceCorrection.Detail detail(UUID propertyId, BankBillingImpact impact) {
		return new InitialBalanceCorrection.Detail(propertyId, "관리비 부과", null, null, null, null,
		    impact.previousMonth(), impact.nextMonth(), impact.missingMonths().stream().map(BankBillingImpact.Month::month).toList());
	}

	private boolean crosses(LocalDate date, LocalDate previous, LocalDate next) {
		return date.isAfter(previous) != date.isAfter(next);
	}

	private String fingerprint(String value) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
		} catch (java.security.NoSuchAlgorithmException failure) {
			throw new IllegalStateException(failure);
		}
	}
}
