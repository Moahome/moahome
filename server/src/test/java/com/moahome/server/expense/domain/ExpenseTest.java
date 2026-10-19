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
}
