package com.moahome.server.billing.service;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.stream.Collectors;
import com.moahome.server.billing.domain.*;
import com.moahome.server.billing.repo.*;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.repo.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BillingGenerationService {
    private final PropertyRepository properties;
    private final UnitRepository units;
    private final BuildingRepository buildings;
    private final BillingTemplates configurations;
    private final BillingPeriodRepository periods;
    private final ChargeRepository charges;
    private final ChargeItemRepository items;
    private final Clock clock;
    public BillingGenerationService(PropertyRepository properties, UnitRepository units, BuildingRepository buildings,
        BillingTemplates configurations, BillingPeriodRepository periods, ChargeRepository charges, ChargeItemRepository items, Clock clock) {
        this.properties=properties; this.units=units; this.buildings=buildings; this.configurations=configurations;
        this.periods=periods; this.charges=charges; this.items=items; this.clock=clock;
    }
    /** 월·관리대상별 독립 트랜잭션에서 생성과 확정을 완료하며 동시 스케줄·재시도에는 같은 기간을 다시 생성하지 않습니다. */
    @Transactional
    public boolean generate(UUID propertyId, YearMonth month) {
        // 세대 변경·기본 설정 저장과 같은 관리대상 잠금을 사용해 대상과 적용 설정을 일관되게 읽습니다.
        var property = properties.findForUnitUpdate(propertyId).orElse(null);
        if (property == null || property.getStatus()!=PropertyStatus.ACTIVE
            || month.isBefore(BillingCalendar.firstMonth(property)) || month.isAfter(BillingCalendar.currentMonth(clock))) return false;
        var existing = periods.findByPropertyIdAndBillingYearAndBillingMonth(propertyId, (short)month.getYear(), (short)month.getMonthValue());
        if (existing.isPresent()) {
            if (!"ISSUED".equals(existing.get().getStatus())) throw new IllegalStateException("Incomplete billing period");
            return false;
        }
        var template = configurations.applicable(configurations.versions(propertyId), month);
        var sources = configurations.items(template);
        var total = sources.stream().map(FeeTemplateItem::getDefaultAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        var names = buildings.findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(propertyId).stream()
            .collect(Collectors.toMap(Building::getId, Building::getName));
        var at = OffsetDateTime.now(clock);
        var period = periods.saveAndFlush(BillingPeriod.draft(propertyId, month, at));
        List<Charge> headers = new ArrayList<>();
        List<ChargeItem> snapshots = new ArrayList<>();
        for (var unit : units.findByPropertyIdAndDeletedAtIsNull(propertyId)) {
            if (unit.getStatus()==UnitStatus.INACTIVE) continue;
            var charge = Charge.draft(period, unit, names.getOrDefault(unit.getBuildingId(), ""), total, at);
            charge.issue(at);
            headers.add(charge);
            sources.forEach(source -> snapshots.add(ChargeItem.snapshot(charge, source, at)));
        }
        charges.saveAllAndFlush(headers);
        items.saveAllAndFlush(snapshots);
        period.confirm(at);
        periods.flush();
        // 어느 저장 단계라도 실패하면 기간·모든 청구·항목을 함께 롤백해 다음 실행에서 안전하게 재시도합니다.
        return true;
    }
}
