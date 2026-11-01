package com.moahome.server.billing.domain;

import java.time.*;
import com.moahome.server.property.domain.Property;

/** 부과·조회·설정 예약에서 한국시간과 월 경계를 동일하게 사용합니다. */
public final class BillingCalendar {
	public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

	private BillingCalendar() {
	}

	public static YearMonth currentMonth(Clock clock) {
		return YearMonth.now(clock.withZone(ZONE));
	}

	/** 통장 기준일은 당일 마감입니다. 월중이면 해당 월 전액, 월말이면 다음 월부터 부과합니다. */
	public static YearMonth firstMonthFromCutoff(LocalDate cutoff) {
		YearMonth month = YearMonth.from(cutoff);
		return cutoff.equals(month.atEndOfMonth()) ? month.plusMonths(1) : month;
	}

	/** 기존에 지정한 더 늦은 첫 월도 허용하되 기준일보다 앞선 부과월은 저장하지 않습니다. */
	public static boolean validStart(LocalDate cutoff, YearMonth first) {
		return cutoff != null && !first.isBefore(firstMonthFromCutoff(cutoff));
	}

	/** 운영 시작 전에는 등록월을 설정 표시용으로만 사용하고 실제 부과는 별도 운영 시작 검증을 거칩니다. */
	public static YearMonth firstMonth(Property property) {
		return property.getFirstBillingMonth() == null ? YearMonth.from(property.getCreatedAt().atZoneSameInstant(ZONE))
		    : YearMonth.from(property.getFirstBillingMonth());
	}

	public static YearMonth parseMonth(String value) {
		if (value == null || !value.matches("[1-9][0-9]{3}-(0[1-9]|1[0-2])"))
			throw new IllegalArgumentException("Invalid billing month");
		return YearMonth.parse(value);
	}
}
