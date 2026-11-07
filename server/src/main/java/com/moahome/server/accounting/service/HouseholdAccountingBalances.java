package com.moahome.server.accounting.service;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.moahome.server.accounting.dto.IncomeStatementResponse;
import com.moahome.server.payment.dto.PaymentResponse;

/** 수납 원장의 확정 충당·인계 자료로 102 미수금과 201 선수금을 자동 계산하며 손익 전표를 만들지 않습니다. */
final class HouseholdAccountingBalances {
	private HouseholdAccountingBalances() {
	}

	static List<IncomeStatementResponse.Household> calculate(PaymentResponse.Ledger ledger, YearMonth end,
		UUID receivableAccount, UUID advanceAccount) {
		if (ledger == null)
			return List.of();
		Map<UUID, PaymentResponse.Charge> charges = new HashMap<>();
		Map<UUID, BigDecimal> unpaid = new HashMap<>();
		Map<UUID, BigDecimal> advances = new HashMap<>();
		for (PaymentResponse.Charge charge : ledger.charges()) {
			if (!"ISSUED".equals(charge.status()) || charge.month().compareTo(end.toString()) > 0
				|| new BigDecimal(charge.amount()).signum() <= 0)
				continue;
			charges.put(charge.id(), charge);
			unpaid.merge(charge.unitId(), new BigDecimal(charge.amount()), BigDecimal::add);
		}
		for (PaymentResponse.Payment payment : ledger.payments()) {
			// 기준일까지의 OPENING 입금은 인계 잔액에 이미 포함되어 기존 선납과 중복 합산하지 않습니다.
			if (!"CONFIRMED".equals(payment.status())
				|| !"HOUSEHOLD".equals(payment.receiptType()) || payment.date().isAfter(end.atEndOfMonth())
				|| payment.unitId() == null || payment.unitId().isBlank())
				continue;
			UUID unit = UUID.fromString(payment.unitId());
			BigDecimal used = apply(unit, payment.allocations(), charges, unpaid);
			BigDecimal remaining = new BigDecimal(payment.amount()).subtract(used);
			if (remaining.signum() < 0)
				throw new IllegalStateException("Household receipt exceeds original amount");
			advances.merge(unit, remaining, BigDecimal::add);
		}
		// 기존 선납 인계는 선수금 잔액에만 반영하고 은행 입금·당기 수익으로 재생성하지 않습니다.
		for (PaymentResponse.OpeningCredit opening : ledger.openingCredits()) {
			if (opening.date().isAfter(end.atEndOfMonth()))
				continue;
			BigDecimal used = apply(opening.unitId(), opening.allocations(), charges, unpaid);
			BigDecimal remaining = new BigDecimal(opening.amount()).subtract(used);
			if (remaining.signum() < 0)
				throw new IllegalStateException("Household opening credit exceeds original amount");
			advances.merge(opening.unitId(), remaining, BigDecimal::add);
		}
		List<IncomeStatementResponse.Household> result = new ArrayList<>();
		for (PaymentResponse.Unit unit : ledger.units()) {
			BigDecimal debt = unpaid.getOrDefault(unit.id(), BigDecimal.ZERO);
			BigDecimal advance = advances.getOrDefault(unit.id(), BigDecimal.ZERO);
			if (debt.signum() < 0)
				throw new IllegalStateException("Household allocations exceed issued charge");
			if (debt.signum() == 0 && advance.signum() == 0)
				continue;
			result.add(new IncomeStatementResponse.Household(unit.id(), unit.label(), receivableAccount, advanceAccount,
				debt.toPlainString(), advance.toPlainString(), "/banking/monthly/" + end + "/" + unit.id() + "?month=" + end));
		}
		return List.copyOf(result);
	}

	/** 조회 월말 이후 청구에 배분된 금액은 당시 선수금으로 남기고 현재 원장을 수정하지 않습니다. */
	private static BigDecimal apply(UUID unit, List<PaymentResponse.Allocation> allocations,
		Map<UUID, PaymentResponse.Charge> charges, Map<UUID, BigDecimal> unpaid) {
		BigDecimal used = BigDecimal.ZERO;
		for (PaymentResponse.Allocation allocation : allocations) {
			PaymentResponse.Charge charge = charges.get(allocation.chargeId());
			if (charge == null)
				continue;
			if (!unit.equals(charge.unitId()))
				throw new IllegalStateException("Household allocation scope mismatch");
			BigDecimal amount = new BigDecimal(allocation.amount());
			unpaid.merge(unit, amount.negate(), BigDecimal::add);
			used = used.add(amount);
		}
		return used;
	}
}
