package com.moahome.server.expense.domain;

import java.math.BigDecimal;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class ExpenseTest {
	Expense.Share share(String label, String amount, String percentage) {
		return new Expense.Share(null, label, amount, percentage);
	}

	@Test
	void evenlySplitsElevatorAndQuartersElectricity() {
		assertThat(Expense.allocate(new BigDecimal("506000"), "EQUAL",
		    List.of(share("102", null, null), share("103", null, null))))
		    .containsExactly(new BigDecimal("253000"), new BigDecimal("253000"));
		assertThat(Expense.allocate(new BigDecimal("182660"), "RATIO",
		    List.of(share("102", null, "25"), share("103", null, "25"), share("외부", null, "50"))))
		    .containsExactly(new BigDecimal("45665"), new BigDecimal("45665"), new BigDecimal("91330"));
	}

	@Test
	void requiresExplicitWholeWonRemainderAndFullAllocation() {
		assertThatThrownBy(() -> Expense.allocate(new BigDecimal("101"), "EQUAL",
		    List.of(share("102", null, null), share("103", null, null)))).isInstanceOf(RuntimeException.class);
		assertThatThrownBy(() -> Expense.allocate(new BigDecimal("182660"), "RATIO",
		    List.of(share("102", null, "25"), share("103", null, "25")))).isInstanceOf(RuntimeException.class);
		assertThat(Expense.allocate(new BigDecimal("101"), "AMOUNT",
		    List.of(share("102", "50", null), share("103", "51", null))))
		    .containsExactly(new BigDecimal("50"), new BigDecimal("51"));
	}

	@Test
	void rejectsDuplicateTargetsNegativeAmountsAndOverAllocation() {
		for (var shares : List.of(List.of(share("same", "50", null), share("same", "50", null)),
		    List.of(share("a", "-1", null)), List.of(share("a", "101", null))))
			assertThatThrownBy(() -> Expense.allocate(new BigDecimal("100"), "AMOUNT", shares))
			    .isInstanceOf(RuntimeException.class);
	}

	/** 비율은 유지하며 절사 후 남은 1원 전액을 명시한 부담처에만 반영합니다. */
	@Test
	void ratioRemainderPreservesPercentagesAndOtherShares() {
		var shares = List.of(share("외부 101동", "86105", "50"), share("102동", "43053", "25"),
		    share("103동", "43052", "25"));
		assertThat(Expense.allocate(new BigDecimal("172210"), "RATIO", shares))
		    .containsExactly(new BigDecimal("86105"), new BigDecimal("43053"), new BigDecimal("43052"));
		assertThat(shares).extracting(Expense.Share::percentage).containsExactly("50", "25", "25");
		assertThat(Expense.allocate(new BigDecimal("172210"), "RATIO",
		    List.of(share("외부", "86106", "50"), share("102", "43052", "25"), share("103", "43052", "25"))))
		    .containsExactly(new BigDecimal("86106"), new BigDecimal("43052"), new BigDecimal("43052"));
	}

	/** 비율 미완성·선택 누락·초과 이동·둘 이상의 조정은 나머지 버튼 요청으로 우회할 수 없습니다. */
	@Test
	void ratioRemainderRejectsMissingSelectionAndArbitraryRedistribution() {
		for (var parts : List.of(
		    List.of(share("a", "43052", "25"), share("b", "43052", "25")),
		    List.of(share("a", null, "50"), share("b", null, "25"), share("c", null, "25")),
		    List.of(share("a", "86105", "50"), share("b", "43052", "25"), share("c", "43052", "25")),
		    List.of(share("a", "86104", "50"), share("b", "43054", "25"), share("c", "43052", "25"))))
			assertThatThrownBy(() -> Expense.allocate(new BigDecimal("172210"), "RATIO", parts))
			    .isInstanceOf(RuntimeException.class);
		// 절사 금액이 0원이더라도 명시한 한 곳에 나머지를 더해 모든 최종 몫이 양수이면 허용합니다.
		assertThat(Expense.allocate(new BigDecimal("3"), "RATIO",
		    List.of(share("a", "1", "10"), share("b", "2", "90"))))
		    .containsExactly(BigDecimal.ONE, new BigDecimal("2"));
	}
}
