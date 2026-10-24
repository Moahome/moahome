package com.moahome.server.closing.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.UUID;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.banking.dto.BankingResponse;
import com.moahome.server.banking.service.BankingBalanceService;
import com.moahome.server.banking.service.BankingService;
import com.moahome.server.billing.domain.BillingCalendar;
import com.moahome.server.closing.dto.MonthlySettlementResponse;
import com.moahome.server.payment.service.PaymentService;
import com.moahome.server.property.service.ManagementAccessService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MonthlySettlementService {
	private final ManagementAccessService access;

	private final BankingService banking;

	private final BankingBalanceService balances;

	private final PaymentService payments;

	private final Clock clock;

	public MonthlySettlementService(ManagementAccessService access, BankingService banking,
	    BankingBalanceService balances, PaymentService payments, Clock clock) {
		this.access = access;
		this.banking = banking;
		this.balances = balances;
		this.payments = payments;
		this.clock = clock;
	}

	/** 관리자 조회를 하나의 읽기 스냅샷으로 묶어 수납·잔고·거래가 서로 다른 변경 상태로 섞이지 않게 합니다. */
	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	public MonthlySettlementResponse get(UUID user, UUID property, String rawMonth) {
		access.getManagementContext(user, property);
		YearMonth month = rawMonth == null ? BillingCalendar.currentMonth(clock) : BillingCalendar.parseMonth(rawMonth);
		var ledger = payments.workspace(user, property);
		var bank = banking.workspace(user, property);
		var cash = balances.workspace(user, property, month.toString());
		// 월별 실제 거래만 반환하되 미납·선입금 계산에 필요한 수납 원장은 기존 누적 범위를 유지합니다.
		var monthlyBank = new BankingResponse.Workspace(bank.propertyId(), bank.asOf(), bank.buildings(), bank.units(),
		    bank.rows().stream().filter(row -> YearMonth.from(row.date()).equals(month)).toList(), bank.rules(),
		    bank.accounts());
		return new MonthlySettlementResponse(property, month.toString(), OffsetDateTime.now(clock), monthlyBank, cash,
		    ledger);
	}
}
