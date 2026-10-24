package com.moahome.server.banking.domain;

import java.time.*;
import java.util.*;

/** 날짜만 있는 거래의 시각을 추측하지 않고 입증 가능한 최신 확인값만 선택합니다. */
public final class BankBalanceSelection {
	private BankBalanceSelection() {
	}

	public record Candidate(String source, UUID id, LocalDate date, LocalTime time, String precision, String amount,
	    String status) {
	}

	/** 마감값은 해당 날짜의 거래 이후이며 날짜만 있는 거래와 당일 시각 자료는 순서 미확인으로 남깁니다. */
	private static boolean later(Candidate a, Candidate b) {
		int date = a.date().compareTo(b.date());
		if (date != 0)
			return date > 0;
		if (a.precision().equals("DAY_END"))
			return !b.precision().equals("DAY_END");
		if (b.precision().equals("DAY_END") || a.time() == null || b.time() == null)
			return false;
		return a.time().isAfter(b.time());
	}

	/** 늦게 업로드한 과거 자료는 최신값을 덮지 않으며 최신 거래의 잔액 누락도 숨기지 않습니다. */
	public static Candidate select(List<Candidate> candidates) {
		List<Candidate> newest = candidates.stream()
		    .filter(c -> candidates.stream().noneMatch(other -> later(other, c))).toList();
		if (newest.isEmpty())
			return null;
		Candidate first = newest.getFirst();
		if (newest.size() == 1)
			return first;
		boolean equivalent = newest.stream()
		    .allMatch(c -> Objects.equals(c.amount(), first.amount()) && c.status().equals(first.status())
		        && c.precision().equals(first.precision()) && Objects.equals(c.time(), first.time()));
		if (equivalent)
			return new Candidate("MULTIPLE", null, first.date(), first.time(), first.precision(), first.amount(),
			    first.status());
		return new Candidate("MULTIPLE", null, first.date(), null, "DATE", null, "ORDER_UNCLEAR");
	}
}
