package com.moahome.server.dashboard.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import com.moahome.server.banking.dto.BankingResponse;
import com.moahome.server.banking.service.BankingBalanceService;
import com.moahome.server.banking.service.BankingService;
import com.moahome.server.billing.domain.BillingCalendar;
import com.moahome.server.dashboard.dto.DashboardResponse;
import com.moahome.server.membership.service.MembershipRequestService;
import com.moahome.server.membership.service.ResidentInvitationService;
import com.moahome.server.payment.dto.PaymentResponse;
import com.moahome.server.payment.service.PaymentService;
import com.moahome.server.property.dto.ManagementPropertyResponse;
import com.moahome.server.property.service.ManagementAccessService;

@Service
public class DashboardService {
	private final ManagementAccessService access;
	private final BankingService banking;
	private final BankingBalanceService balances;
	private final PaymentService payments;
	private final MembershipRequestService memberships;
	private final ResidentInvitationService invitations;
	private final Clock clock;

	public DashboardService(ManagementAccessService access, BankingService banking, BankingBalanceService balances,
		PaymentService payments, MembershipRequestService memberships, ResidentInvitationService invitations,
		Clock clock) {
		this.access = access;
		this.banking = banking;
		this.balances = balances;
		this.payments = payments;
		this.memberships = memberships;
		this.invitations = invitations;
		this.clock = clock;
	}

	/** 현재 권한을 먼저 확인하고 월별 원천과 현재 업무를 같은 DB 읽기 스냅샷에서 조회합니다. */
	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	public DashboardResponse get(UUID user, UUID property, String rawMonth) {
		ManagementPropertyResponse context = access.getManagementContext(user, property);
		YearMonth month = rawMonth == null ? BillingCalendar.currentMonth(clock) : BillingCalendar.parseMonth(rawMonth);
		LocalDate today = LocalDate.now(clock.withZone(BillingCalendar.ZONE));
		PaymentResponse.Ledger ledger = payments.workspace(user, property);
		BankingResponse.Workspace bank = banking.workspace(user, property);
		var selectedBalances = balances.workspace(user, property, month.toString());
		// 과거 월을 선택해도 현재까지 회수하지 못한 업무는 숨기지 않습니다. 원천 실패는 전체 조회 실패로 전달합니다.
		var currentBalances = month.equals(YearMonth.from(today)) ? selectedBalances
			: balances.workspace(user, property, YearMonth.from(today).toString());
		List<BankingResponse.Transaction> currentRows = bank.rows().stream()
			.filter(row -> !row.date().isAfter(today)).toList();
		long pendingIncome = currentRows.stream().filter(row -> "PENDING".equals(row.status()) && "INCOME".equals(row.direction()))
			.count();
		pendingIncome += ledger.payments().stream().filter(row -> !row.date().isAfter(today)
			&& unlinkedManual(row) && "PENDING".equals(row.status())).count();
		long pendingExpenses = currentRows.stream()
			.filter(row -> "PENDING".equals(row.status()) && "EXPENSE".equals(row.direction())).count();
		long pendingRequests = memberships.workspace(user, property).requests().stream()
			.filter(row -> "PENDING".equals(row.status())).count();
		long pendingChanges = invitations.workspace(user, property).invitations().stream()
			.filter(row -> "CHANGE_REQUESTED".equals(row.status())).count();
		long external = currentBalances.externals().stream().filter(row -> !row.excluded()
			&& !row.date().isAfter(today) && new BigDecimal(row.remaining()).signum() > 0).count();
		var tasks = new DashboardResponse.Tasks(pendingIncome, pendingExpenses, pendingRequests, pendingChanges,
			external, duplicateCount(currentRows, ledger, today));
		var monthlyBank = new BankingResponse.Workspace(bank.propertyId(), bank.asOf(), bank.buildings(), bank.units(),
			currentRows.stream().filter(row -> YearMonth.from(row.date()).equals(month)).toList(), List.of(),
			bank.accounts());
		// 6개월 수납 계산에는 누적 원장 한 벌만 전송하고 대시보드에서 사용하지 않는 처리 이력은 제외합니다.
		var paymentData = new PaymentResponse.Ledger(ledger.propertyId(), ledger.asOf(), ledger.accounts(),
			ledger.units(), ledger.charges(), ledger.payments(), List.of(), ledger.openingCredits(), ledger.buildings());
		return new DashboardResponse(property, context.name(), month.toString(), today, OffsetDateTime.now(clock),
			monthlyBank, selectedBalances, paymentData, tasks);
	}

	private boolean unlinkedManual(PaymentResponse.Payment row) {
		return "MANUAL".equals(row.source()) && row.bankTransactionId() == null && row.linkedPaymentId() == null;
	}

	/** 동일 통장·날짜·방향·금액은 검토 후보일 뿐이며 자동 중복 제외나 실제 수납 취소를 하지 않습니다. */
	private long duplicateCount(List<BankingResponse.Transaction> rows, PaymentResponse.Ledger ledger, LocalDate today) {
		Set<String> bankKeys = rows.stream().filter(row -> !"MANUAL".equals(row.sourceType()))
			.map(row -> comparisonKey(row.accountId(), row.date(), row.direction(), row.amount()))
			.collect(Collectors.toSet());
		long expenses = rows.stream().filter(row -> "MANUAL".equals(row.sourceType())
			&& bankKeys.contains(comparisonKey(row.accountId(), row.date(), row.direction(), row.amount()))).count();
		return expenses + ledger.payments().stream().filter(row -> unlinkedManual(row) && !row.date().isAfter(today)
			&& Set.of("PENDING", "ON_HOLD", "CONFIRMED").contains(row.status())
			&& bankKeys.contains(comparisonKey(row.accountId(), row.date(), "INCOME", row.amount()))).count();
	}

	private String comparisonKey(UUID account, LocalDate date, String direction, String amount) {
		return account + ":" + date + ":" + direction + ":" + new BigDecimal(amount).toBigIntegerExact();
	}
}
