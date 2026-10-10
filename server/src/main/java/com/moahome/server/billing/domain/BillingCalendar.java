package com.moahome.server.billing.domain;

import java.time.*;
import com.moahome.server.property.domain.Property;

/** 부과·조회·설정 예약에서 한국시간과 월 경계를 동일하게 사용합니다. */
public final class BillingCalendar {
    public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private BillingCalendar() {}
    public static YearMonth currentMonth(Clock clock) { return YearMonth.now(clock.withZone(ZONE)); }
    /** 최초 설정을 마친 등록월에도 청구가 있어야 하므로 등록한 한국시간 월부터 부과합니다. */
    public static YearMonth firstMonth(Property property) {
        return YearMonth.from(property.getCreatedAt().atZoneSameInstant(ZONE));
    }
    public static YearMonth parseMonth(String value) {
        if (value == null || !value.matches("[1-9][0-9]{3}-(0[1-9]|1[0-2])")) throw new IllegalArgumentException("Invalid billing month");
        return YearMonth.parse(value);
    }
}
