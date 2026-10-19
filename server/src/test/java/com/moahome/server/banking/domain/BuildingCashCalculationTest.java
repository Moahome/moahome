package com.moahome.server.banking.domain;

import java.math.BigDecimal;
import java.time.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class BuildingCashCalculationTest {
	@Test
	void cutoffIsClosingBalanceAndEarlierMovementsAreNeverCountedAgain() {
		var result = BuildingCashCalculation.calculate(new BigDecimal("100000"), LocalDate.of(2026, 9, 30),
		    YearMonth.of(2026, 11),
		    List.of(move("2026-09-30", "50000", "0"), move("2026-10-01", "50000", "0"),
		        move("2026-10-31", "0", "45665"), move("2026-11-01", "0", "200000"),
		        move("2026-12-01", "900000", "0")));
		assertThat(result.start()).isEqualByComparingTo("104335");
		assertThat(result.income()).isEqualByComparingTo("0");
		assertThat(result.expense()).isEqualByComparingTo("200000");
		assertThat(result.balance()).isEqualByComparingTo("-95665");
	}

	@Test
	void earlierMonthReversesThroughCutoffButNeverUsesLaterMovements() {
		var result = BuildingCashCalculation.calculate(new BigDecimal("600000"), LocalDate.of(2026, 10, 15),
		    YearMonth.of(2026, 9), List.of(move("2026-09-01", "50000", "0"), move("2026-09-30", "0", "10000"),
		        move("2026-10-01", "0", "30000"), move("2026-10-15", "20000", "0"), move("2026-10-16", "900000", "0")));
		assertThat(result.start()).isEqualByComparingTo("570000");
		assertThat(result.income()).isEqualByComparingTo("50000");
		assertThat(result.expense()).isEqualByComparingTo("10000");
		assertThat(result.balance()).isEqualByComparingTo("610000");
	}

	@Test
	void cutoffMonthIncludesBothSidesOfAnchorExactlyOnce() {
		var result = BuildingCashCalculation.calculate(new BigDecimal("100000"), LocalDate.of(2026, 10, 15),
		    YearMonth.of(2026, 10), List.of(move("2026-09-30", "900000", "0"), move("2026-10-01", "50000", "0"),
		        move("2026-10-15", "0", "30000"), move("2026-10-16", "0", "200000")));
		assertThat(result.start()).isEqualByComparingTo("80000");
		assertThat(result.income()).isEqualByComparingTo("50000");
		assertThat(result.expense()).isEqualByComparingTo("230000");
		assertThat(result.balance()).isEqualByComparingTo("-100000");
	}

	@Test
	void reverseCrossesYearBoundaryAndLeapDay() {
		var result = BuildingCashCalculation.calculate(new BigDecimal("100"), LocalDate.of(2024, 3, 1),
		    YearMonth.of(2024, 2), List.of(move("2024-02-29", "0", "200"), move("2024-03-01", "50", "0")));
		assertThat(result.start()).isEqualByComparingTo("250");
		assertThat(result.balance()).isEqualByComparingTo("50");
		var previousYear = BuildingCashCalculation.calculate(new BigDecimal("100"), LocalDate.of(2026, 1, 1),
		    YearMonth.of(2025, 12), List.of(move("2026-01-01", "50", "0")));
		assertThat(previousYear.balance()).isEqualByComparingTo("50");
	}

	private BuildingCashCalculation.Movement move(String date, String income, String expense) {
		return new BuildingCashCalculation.Movement(LocalDate.parse(date), new BigDecimal(income),
		    new BigDecimal(expense));
	}
}
