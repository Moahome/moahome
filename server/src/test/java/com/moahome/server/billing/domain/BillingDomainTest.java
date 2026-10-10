package com.moahome.server.billing.domain;

import java.math.BigDecimal;
import java.time.*;
import java.util.UUID;
import com.moahome.server.property.domain.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class BillingDomainTest {
    private final OffsetDateTime at = OffsetDateTime.parse("2028-02-01T00:00:00+09:00");
    @Test
    void leapMonthAndSingleConfirmationPreserveStateOnInvalidInput() {
        var period = BillingPeriod.draft(UUID.randomUUID(), YearMonth.of(2028, 2), at);
        assertThat(period.getDefaultDueDate()).isEqualTo(LocalDate.of(2028, 2, 29));
        assertThatThrownBy(() -> period.confirm(null)).isInstanceOf(NullPointerException.class);
        assertThat(period.getStatus()).isEqualTo("DRAFT");
        period.confirm(at);
        assertThatThrownBy(() -> period.confirm(at)).isInstanceOf(IllegalStateException.class);
        assertThat(BillingCalendar.currentMonth(Clock.fixed(Instant.parse("2026-10-31T15:00:00Z"), ZoneOffset.UTC)))
            .isEqualTo(YearMonth.of(2026, 11));
        assertThatThrownBy(() -> BillingCalendar.parseMonth("2026-13")).isInstanceOf(IllegalArgumentException.class);
    }
    @Test
    void zeroNegativeAndBoundariesAreAllowedButWrongScopeFractionAndOverflowFail() {
        var property = Property.create("관리대상", "주소", null, null, false, at);
        var unit = Unit.create(property, null, "101", null, 1, UnitStatus.ACTIVE, at);
        var period = BillingPeriod.draft(property.getId(), YearMonth.of(2028, 2), at);
        for (String value : new String[]{"0", "-1", "999999999999999", "-999999999999999"}) {
            var charge = Charge.draft(period, unit, "", new BigDecimal(value), at);
            assertThatThrownBy(() -> charge.issue(null)).isInstanceOf(NullPointerException.class);
            assertThat(charge.getStatus()).isEqualTo("DRAFT");
            charge.issue(at);
            assertThat(charge.getTotalAmount()).isEqualByComparingTo(value);
            assertThatThrownBy(() -> charge.issue(at)).isInstanceOf(IllegalStateException.class);
        }
        for (String value : new String[]{"1.5", "1000000000000000", "-1000000000000000"}) {
            assertThatThrownBy(() -> Charge.draft(period, unit, "", new BigDecimal(value), at)).isInstanceOf(IllegalArgumentException.class);
        }
        var foreign = BillingPeriod.draft(UUID.randomUUID(), YearMonth.of(2028, 2), at);
        assertThatThrownBy(() -> Charge.draft(foreign, unit, "", BigDecimal.ZERO, at)).isInstanceOf(IllegalArgumentException.class);
    }
}
