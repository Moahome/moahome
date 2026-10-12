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
        var at = OffsetDateTime.now(clock);
        var period = periods.saveAndFlush(BillingPeriod.draft(propertyId, month, at));
        issueCharges(propertyId, period, units.findByPropertyIdAndDeletedAtIsNull(propertyId), at);
        period.confirm(at);
        periods.flush();
        // 어느 저장 단계라도 실패하면 기간·모든 청구·항목을 함께 롤백해 다음 실행에서 안전하게 재시도합니다.
        return true;
    }

    /** 세대 추가와 같은 트랜잭션에서 당월 전액을 보충하며 기존 청구·다음 달 예약 설정은 변경하지 않습니다. */
    @Transactional
    public void addCurrentMonthUnits(UUID propertyId, Collection<UUID> unitIds) {
        if (unitIds.isEmpty()) return;
        properties.findForUnitUpdate(propertyId).orElseThrow();
        var month = BillingCalendar.currentMonth(clock);
        // 아직 당월 기간이 없다면 현재 전체 세대로 한 번 생성합니다. 실패하면 세대 추가도 함께 롤백됩니다.
        if (generate(propertyId, month)) return;
        var period = periods.findByPropertyIdAndBillingYearAndBillingMonth(propertyId, (short)month.getYear(), (short)month.getMonthValue())
            .orElseThrow();
        synchronizeCurrentMonthTargets(propertyId, period);
        var charged = charges.findByBillingPeriodId(period.getId()).stream().map(Charge::getUnitId).collect(Collectors.toSet());
        var additions = units.findByPropertyIdAndIdIn(propertyId, unitIds).stream()
            .filter(unit -> unit.getDeletedAt() == null && !charged.contains(unit.getId())).toList();
        if (additions.isEmpty()) return;
        issueCharges(propertyId, period, additions, OffsetDateTime.now(clock));
    }

    /** 당월 누락 청구·공실 제외·기존 삭제 누락을 복구하며 과거 월과 수동 취소는 유지합니다. */
    @Transactional
    public void supplementCurrentMonth(UUID propertyId) {
        var property = properties.findForUnitUpdate(propertyId).orElse(null);
        if (property == null || property.getStatus() != PropertyStatus.ACTIVE) return;
        var month = BillingCalendar.currentMonth(clock);
        periods.findByPropertyIdAndBillingYearAndBillingMonth(propertyId, (short)month.getYear(), (short)month.getMonthValue())
            .ifPresent(period -> synchronizeCurrentMonthTargets(propertyId, period));
        var currentUnits = units.findByPropertyIdAndDeletedAtIsNull(propertyId).stream()
            .filter(unit -> unit.getStatus() == UnitStatus.ACTIVE).map(Unit::getId).toList();
        addCurrentMonthUnits(propertyId, currentUnits);
    }

    /** 삭제 시점의 한국시간 당월만 취소하며 이전 달 청구·항목과 재요청의 최초 취소 근거는 보존합니다. */
    @Transactional
    public void cancelCurrentMonthUnits(UUID actor, UUID propertyId, Collection<UUID> unitIds, OffsetDateTime at) {
        if (unitIds.isEmpty()) return;
        properties.findForUnitUpdate(propertyId).orElseThrow();
        var month = YearMonth.from(at.atZoneSameInstant(BillingCalendar.ZONE));
        var period = periods.findByPropertyIdAndBillingYearAndBillingMonth(propertyId, (short)month.getYear(), (short)month.getMonthValue());
        if (period.isEmpty()) return;
        charges.findByBillingPeriodId(period.get().getId()).stream()
            .filter(charge -> unitIds.contains(charge.getUnitId())
                && ("ISSUED".equals(charge.getStatus()) || "EXCLUDED_VACANT".equals(charge.getStatus())))
            .forEach(charge -> charge.cancelForUnitDeletion(actor, at));
        charges.flush();
    }

    /** 최초 자동 부과와 월중 추가 모두 사용 중 세대만 해당 월 적용 설정으로 부과하며 공실·비활성·삭제를 제외합니다. */
    private void issueCharges(UUID propertyId, BillingPeriod period, List<Unit> targets, OffsetDateTime at) {
        var template = configurations.applicable(configurations.versions(propertyId), period.month());
        var sources = configurations.items(template);
        var total = sources.stream().map(FeeTemplateItem::getDefaultAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        var names = buildings.findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(propertyId).stream()
            .collect(Collectors.toMap(Building::getId, Building::getName));
        List<Charge> headers = new ArrayList<>();
        List<ChargeItem> snapshots = new ArrayList<>();
        for (var unit : targets) {
            if (unit.getStatus() != UnitStatus.ACTIVE || unit.getDeletedAt() != null
                || (unit.getBuildingId() != null && !names.containsKey(unit.getBuildingId()))) continue;
            var charge = Charge.draft(period, unit, names.getOrDefault(unit.getBuildingId(), ""), total, at);
            charge.issue(at);
            headers.add(charge);
            sources.forEach(source -> snapshots.add(ChargeItem.snapshot(charge, source, at)));
        }
        charges.saveAllAndFlush(headers);
        items.saveAllAndFlush(snapshots);
    }

    /** 당월 공실 상태를 동기화하고 이전 삭제의 누락 청구는 실제 삭제자 근거로만 취소합니다. */
    private void synchronizeCurrentMonthTargets(UUID propertyId, BillingPeriod period) {
        var allUnits = units.findByPropertyId(propertyId).stream().collect(Collectors.toMap(Unit::getId, unit -> unit));
        var allBuildings = buildings.findByPropertyId(propertyId).stream().collect(Collectors.toMap(Building::getId, building -> building));
        var at = OffsetDateTime.now(clock);
        for (var charge : charges.findByBillingPeriodId(period.getId())) {
            if (!("ISSUED".equals(charge.getStatus()) || "EXCLUDED_VACANT".equals(charge.getStatus()))) continue;
            var unit = allUnits.get(charge.getUnitId());
            if (unit == null) continue;
            var building = unit.getBuildingId() == null ? null : allBuildings.get(unit.getBuildingId());
            UUID actor = unit.getDeletedAt() != null ? unit.getDeletedBy() : null;
            if (actor == null && building != null && building.getDeletedAt() != null) actor = building.getDeletedBy();
            // 삭제자가 없는 과거 자료에 임의의 처리자를 기록하지 않습니다. 조회에서는 삭제된 대상이 제외됩니다.
            if (actor != null) {
                charge.cancelForUnitDeletion(actor, at);
                continue;
            }
            if (unit.getDeletedAt() == null && (building == null || building.getDeletedAt() == null)) {
                charge.applyVacancy(unit.getStatus() == UnitStatus.VACANT, at);
            }
        }
        charges.flush();
    }
}
