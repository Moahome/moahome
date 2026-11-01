package com.moahome.server.banking.domain;

import java.math.BigDecimal;
import java.time.*;
import java.util.List;

public final class BuildingCashCalculation {
	private BuildingCashCalculation() {
	}

	public record Movement(LocalDate date, BigDecimal income, BigDecimal expense) {
	}

	public record Result(BigDecimal start, BigDecimal income, BigDecimal expense, BigDecimal balance) {
	}

	/** 기준일 마감 잔고를 기준으로 이후는 누적하고 이전은 확인된 현금 이동을 역산합니다. 월 입출금은 조회 월 전체입니다. */
	public static Result calculate(BigDecimal opening, LocalDate cutoff, YearMonth month, List<Movement> movements) {
		return calculate(opening, cutoff, month, month, movements);
	}

	/** 기초는 시작 월 직전 마감, 입출금은 기간 합계, 기말은 종료 월 마감으로 계산해 잔액을 월마다 중복 합산하지 않습니다. */
	public static Result calculate(BigDecimal opening, LocalDate cutoff, YearMonth startMonth, YearMonth endMonth,
	    List<Movement> movements) {
		LocalDate start = startMonth.atDay(1), end = endMonth.atEndOfMonth();
		BigDecimal income = BigDecimal.ZERO, expense = BigDecimal.ZERO;
		for (var movement : movements) {
			if (movement.date().isBefore(start) || movement.date().isAfter(end))
				continue;
			income = income.add(movement.income());
			expense = expense.add(movement.expense());
		}
		return new Result(balanceAt(opening, cutoff, start.minusDays(1), movements), income, expense,
		    balanceAt(opening, cutoff, end, movements));
	}

	/** 기준일 당일 거래는 기준 잔고에 이미 포함되므로, 역산 구간은 목표일 초과·기준일 이하로 잡습니다. */
	private static BigDecimal balanceAt(BigDecimal opening, LocalDate cutoff, LocalDate target,
	    List<Movement> movements) {
		BigDecimal result = opening;
		for (var movement : movements) {
			var net = movement.income().subtract(movement.expense());
			if (target.isBefore(cutoff)) {
				if (movement.date().isAfter(target) && !movement.date().isAfter(cutoff))
					result = result.subtract(net);
				continue;
			}
			if (movement.date().isAfter(cutoff) && !movement.date().isAfter(target))
				result = result.add(net);
		}
		return result;
	}
}
