package com.moahome.server.banking.domain;

import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class BankBalanceSelectionTest {
	BankBalanceSelection.Candidate value(String source, String date, String time, String amount) {
		return new BankBalanceSelection.Candidate(source, UUID.randomUUID(), LocalDate.parse(date),
		    time == null ? null : LocalTime.parse(time), time == null ? "DATE" : "TIME", amount,
		    amount == null ? "BALANCE_MISSING" : "READY");
	}

	@Test
	void usesObservationTimeInsteadOfInputOrderAndDoesNotHideMissingLatestBalance() {
		var direct = value("DIRECT_CHECK", "2026-10-24", "09:20", "2400000");
		var old = value("BANK_IMPORT", "2026-10-20", "12:00", "2300000");
		assertThat(BankBalanceSelection.select(List.of(direct, old))).isEqualTo(direct);
		var next = value("BANK_IMPORT", "2026-10-25", "09:00", "2500000");
		assertThat(BankBalanceSelection.select(List.of(direct, next, old))).isEqualTo(next);
		var missing = value("BANK_IMPORT", "2026-10-26", "10:00", null);
		assertThat(BankBalanceSelection.select(List.of(direct, missing))).isEqualTo(missing);
	}

	@Test
	void dateOnlyTransactionsAndConflictingEqualTimesDoNotInventAnOrdering() {
		var direct = value("DIRECT_CHECK", "2026-10-24", "09:20", "2400000");
		assertThat(
		    BankBalanceSelection.select(List.of(direct, value("BANK_IMPORT", "2026-10-24", null, "2300000"))).status())
		    .isEqualTo("ORDER_UNCLEAR");
		assertThat(BankBalanceSelection.select(List.of(direct, value("DIRECT_CHECK", "2026-10-24", "09:20", "2300000")))
		    .amount()).isNull();
	}

	@Test
	void knownClosingBalanceHasEndOfDayMeaningWithoutCreatingATime() {
		var closing = new BankBalanceSelection.Candidate("HANDOVER", UUID.randomUUID(), LocalDate.parse("2026-10-24"),
		    null, "DAY_END", "2500000", "READY");
		assertThat(
		    BankBalanceSelection.select(List.of(closing, value("DIRECT_CHECK", "2026-10-24", "09:20", "2400000"))))
		    .isEqualTo(closing);
	}
}
