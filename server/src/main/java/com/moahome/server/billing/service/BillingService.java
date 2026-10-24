package com.moahome.server.billing.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.*;
import java.util.stream.Collectors;
import com.moahome.server.billing.domain.*;
import com.moahome.server.billing.dto.*;
import com.moahome.server.billing.dto.BillingResponse.*;
import com.moahome.server.billing.repo.*;
import com.moahome.server.billing.exception.BillingException;
import static com.moahome.server.billing.exception.BillingException.Code.*;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.repo.*;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.resident.service.ResidentListService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class BillingService {
	private final ManagementAccessService access;

	private final PropertyRepository properties;

	private final UnitRepository units;

	private final BuildingRepository buildings;

	private final BillingTemplates configurations;

	private final FeeTemplateRepository templates;

	private final FeeTemplateItemRepository templateItems;

	private final BillingPeriodRepository periods;

	private final ChargeRepository charges;

	private final ChargeItemRepository chargeItems;

	private final ResidentListService residents;

	private final Clock clock;

	public BillingService(ManagementAccessService access, PropertyRepository properties, UnitRepository units,
	    BuildingRepository buildings, BillingTemplates configurations, FeeTemplateRepository templates,
	    FeeTemplateItemRepository templateItems, BillingPeriodRepository periods, ChargeRepository charges,
	    ChargeItemRepository chargeItems, ResidentListService residents, Clock clock) {
		this.access = access;
		this.properties = properties;
		this.units = units;
		this.buildings = buildings;
		this.configurations = configurations;
		this.templates = templates;
		this.templateItems = templateItems;
		this.periods = periods;
		this.charges = charges;
		this.chargeItems = chargeItems;
		this.residents = residents;
		this.clock = clock;
	}

	/** 매 요청의 현재 관리 권한을 검증하며 등록 결과나 브라우저 예시로 저장된 설정을 대신하지 않습니다. */
	public Settings settings(UUID userId, UUID propertyId) {
		access.getManagementContext(userId, propertyId);
		var property = properties.findById(propertyId)
		    .orElseThrow(() -> new BillingException(BILLING_SETTINGS_NOT_FOUND));
		return readSettings(property);
	}

	private Settings readSettings(Property property) {
		var month = BillingCalendar.currentMonth(clock);
		List<FeeTemplate> versions = configurations.versions(property.getId());
		var current = configurations.applicable(versions, month);
		var next = configurations.applicable(versions, month.plusMonths(1));
		var first = BillingCalendar.firstMonth(property);
		var nextMonth = month.plusMonths(1).isBefore(first) ? first : month.plusMonths(1);
		return new Settings(property.getId(), month.toString(), first.toString(), nextMonth.atDay(1),
		    versions.getFirst().getId(), template(current),
		    current.getId().equals(next.getId()) ? null : template(next), property.getManagementStartedAt() != null);
	}

	private Template template(FeeTemplate template) {
		return new Template(template.getId(), YearMonth.from(template.getEffectiveFrom()).toString(),
		    configurations.items(template).stream().map(this::item).toList(), template.getChangeReason(),
		    template.getCreatedAt());
	}

	private Item item(FeeTemplateItem item) {
		return new Item(item.getId(), item.getItemCode(), item.getItemName(), item.getDefaultAmount().toPlainString());
	}

	/** 대상 잠금·버전 토큰·적용월 검증 후 새 버전만 추가하며 사유와 이전 항목을 덮어쓰지 않습니다. */
	@Transactional
	public Settings saveSettings(UUID userId, UUID propertyId, BillingSettingsRequest request) {
		access.getManagementContext(userId, propertyId);
		var property = properties.findForUnitUpdate(propertyId)
		    .orElseThrow(() -> new BillingException(BILLING_SETTINGS_NOT_FOUND));
		List<FeeTemplate> versions = configurations.versions(propertyId);
		var nextMonth = BillingCalendar.currentMonth(clock).plusMonths(1);
		if (versions.isEmpty() || !versions.getFirst().getId().equals(request.revisionId())
		    || !nextMonth.toString().equals(request.effectiveMonth()))
			throw new BillingException(BILLING_SETTINGS_CONFLICT);
		BigDecimal total = request.items().stream().map(item -> BigDecimal.valueOf(item.defaultAmount()))
		    .reduce(BigDecimal.ZERO, BigDecimal::add);
		if (total.abs().compareTo(BigDecimal.valueOf(999_999_999_999_999L)) > 0)
			throw new IllegalArgumentException("Invalid total");
		var version = templates.saveAndFlush(FeeTemplate.schedule(propertyId, versions.getFirst().getRevision() + 1,
		    nextMonth, request.reason(), userId, OffsetDateTime.now(clock)));
		var at = version.getCreatedAt();
		List<FeeTemplateItem> saved = new ArrayList<>();
		for (int index = 0; index < request.items().size(); index++) {
			var input = request.items().get(index);
			saved.add(
			    FeeTemplateItem.create(version, input.itemCode(), input.itemName(), input.defaultAmount(), index, at));
		}
		templateItems.saveAllAndFlush(saved);
		return readSettings(property);
	}

	/** 현재·미래 예정액은 실제 설정·세대로 계산하되 생성되지 않은 과거 청구를 확정 데이터로 만들지 않습니다. */
	public Month monthly(UUID userId, UUID propertyId, YearMonth month) {
		var context = access.getManagementContext(userId, propertyId);
		var property = properties.findById(propertyId)
		    .orElseThrow(() -> new BillingException(BILLING_SETTINGS_NOT_FOUND));
		var period = periods.findByPropertyIdAndBillingYearAndBillingMonth(propertyId, (short) month.getYear(),
		    (short) month.getMonthValue());
		if (period.isPresent() && "ISSUED".equals(period.get().getStatus())) {
			return issuedMonth(period.get(), property.isHasBuildings(),
			    representativeNames(userId, propertyId, context.role()));
		}
		var currentMonth = BillingCalendar.currentMonth(clock);
		if (property.getManagementStartedAt() == null || month.isBefore(currentMonth)
		    || month.isBefore(BillingCalendar.firstMonth(property))) {
			return new Month(propertyId, property.isHasBuildings(), month.toString(), month.atDay(1),
			    month.atEndOfMonth(), "NOT_BILLED", "0", List.of());
		}
		var template = configurations.applicable(configurations.versions(propertyId), month);
		List<FeeTemplateItem> items = configurations.items(template);
		var total = items.stream().map(FeeTemplateItem::getDefaultAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
		Map<UUID, String> names = buildings.findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(propertyId)
		    .stream().collect(Collectors.toMap(Building::getId, Building::getName));
		Map<UUID, String> representatives = representativeNames(userId, propertyId, context.role());
		List<BillingResponse.ChargeRow> rows = units.findByPropertyIdAndDeletedAtIsNull(propertyId).stream()
		    .filter(unit -> unit.getStatus() == UnitStatus.ACTIVE)
		    .filter(unit -> unit.getBuildingId() == null || names.containsKey(unit.getBuildingId()))
		    .map(unit -> new ChargeRow(unit.getId(), unit.getId(), names.getOrDefault(unit.getBuildingId(), ""),
		        unit.getUnitNumber(), unit.getDisplayName(), representatives.get(unit.getId()),
		        items.stream().map(this::item).toList()))
		    .toList();
		return new Month(propertyId, property.isHasBuildings(), month.toString(), month.atDay(1), month.atEndOfMonth(),
		    "SCHEDULED", total.toPlainString(), rows);
	}

	/** 세대 목록과 같은 현재 대표 판정을 재사용하며 관리소장과 부담당자에게 같은 현재 대표 이름을 제공합니다. */
	private Map<UUID, String> representativeNames(UUID userId, UUID propertyId, PropertyMemberRole role) {
		return residents.list(userId, propertyId).residents().stream()
		    .filter(resident -> resident.unitId() != null && resident.representative())
		    .collect(Collectors.toMap(resident -> resident.unitId(), resident -> resident.name()));
	}

	/** 청구 금액·세대명은 저장 스냅샷을 유지하고 대표 이름만 현재 명부에서 보완합니다. */
	private Month issuedMonth(BillingPeriod period, boolean hasBuildings, Map<UUID, String> representatives) {
		Set<UUID> currentUnits = undeletedUnitIds(period.getPropertyId());
		List<Charge> headers = charges.findByBillingPeriodId(period.getId()).stream()
		    .filter(charge -> visibleCharge(charge, period.month(), currentUnits)).toList();
		Map<UUID, List<ChargeItem>> snapshots = headers.isEmpty()
		    ? Map.<UUID, List<ChargeItem>>of()
		    : chargeItems.findByChargeIdInOrderBySortOrderAsc(headers.stream().map(Charge::getId).toList()).stream()
		        .collect(Collectors.groupingBy(ChargeItem::getChargeId));
		List<BillingResponse.ChargeRow> rows = headers.stream()
		    .map(charge -> new ChargeRow(charge.getId(), charge.getUnitId(), charge.getBuildingName(),
		        charge.getUnitNumber(), charge.getDisplayName(), representatives.get(charge.getUnitId()),
		        snapshots.getOrDefault(charge.getId(), List.of()).stream().map(item -> new Item(item.getId(),
		            item.getItemCode(), item.getItemName(), item.getAmount().toPlainString())).toList()))
		    .toList();
		String base = headers.isEmpty() ? "0" : headers.getFirst().getTotalAmount().toPlainString();
		return new Month(period.getPropertyId(), hasBuildings, period.month().toString(), period.getBillingDate(),
		    period.getDefaultDueDate(), "ISSUED", base, rows);
	}

	/** 상세 재진입도 같은 관리대상·월의 저장 결과만 사용하고 존재하지 않는 세대는 404로 구분합니다. */
	public Month detail(UUID userId, UUID propertyId, YearMonth month, UUID unitId) {
		var result = monthly(userId, propertyId, month);
		var row = result.charges().stream().filter(charge -> charge.unitId().equals(unitId)).findFirst()
		    .orElseThrow(() -> new BillingException(BILLING_CHARGE_NOT_FOUND));
		return new Month(propertyId, result.hasBuildings(), month.toString(), result.billingDate(), result.dueDate(),
		    result.status(), result.baseAmount(), List.of(row));
	}

	/** 세대 변경·스케줄과 같은 잠금으로 당월 청구를 취소하고 과거 이력과 다음 달 자동 부과는 보존합니다. */
	@Transactional
	public void cancelCharge(UUID userId, UUID propertyId, YearMonth month, UUID chargeId) {
		access.getManagementContext(userId, propertyId);
		properties.findForUnitUpdate(propertyId).orElseThrow(() -> new BillingException(BILLING_CHARGE_NOT_FOUND));
		var period = periods.findByPropertyIdAndBillingYearAndBillingMonth(propertyId, (short) month.getYear(),
		    (short) month.getMonthValue()).orElseThrow(() -> new BillingException(BILLING_CHARGE_NOT_FOUND));
		var charge = charges.findById(chargeId)
		    .filter(
		        value -> value.getPropertyId().equals(propertyId) && period.getId().equals(value.getBillingPeriodId()))
		    .orElseThrow(() -> new BillingException(BILLING_CHARGE_NOT_FOUND));
		if (!month.equals(BillingCalendar.currentMonth(clock)) || !"ISSUED".equals(period.getStatus())
		    || !("ISSUED".equals(charge.getStatus()) || "CANCELED".equals(charge.getStatus()))) {
			throw new BillingException(BILLING_CANCELLATION_NOT_ALLOWED);
		}
		if (charges.hasActiveAllocations(List.of(charge.getId())))
			throw new BillingException(BILLING_CHARGE_HAS_PAYMENTS);
		charge.cancelManually(userId, OffsetDateTime.now(clock));
		charges.flush();
	}

	/** 이력은 확정 기간만 조회하고 signed 합계는 BigDecimal로 계산해 여러 세대 합계의 정밀도를 보존합니다. */
	public History history(UUID userId, UUID propertyId) {
		access.getManagementContext(userId, propertyId);
		Set<UUID> currentUnits = undeletedUnitIds(propertyId);
		Map<UUID, List<Charge>> grouped = charges.findByPropertyId(propertyId).stream()
		    .filter(charge -> "ISSUED".equals(charge.getStatus()) && charge.getBillingPeriodId() != null)
		    .collect(Collectors.groupingBy(Charge::getBillingPeriodId));
		return new History(propertyId, periods.findByPropertyIdOrderByBillingYearDescBillingMonthDesc(propertyId)
		    .stream().filter(period -> "ISSUED".equals(period.getStatus())).map(period -> {
			    List<Charge> rows = grouped.getOrDefault(period.getId(), List.of()).stream()
			        .filter(charge -> visibleCharge(charge, period.month(), currentUnits)).toList();
			    var total = rows.stream().map(Charge::getTotalAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
			    return new Period(period.month().toString(), period.getBillingDate(), period.getDefaultDueDate(),
			        rows.size(), total.toPlainString(), period.getConfirmedAt());
		    }).toList());
	}

	/** 삭제 전 구현에서 남은 청구도 당월 집계에 섞이지 않게 동과 세대의 실제 삭제 상태를 함께 확인합니다. */
	private Set<UUID> undeletedUnitIds(UUID propertyId) {
		Set<UUID> buildingIds = buildings.findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(propertyId)
		    .stream().map(Building::getId).collect(Collectors.toSet());
		return units.findByPropertyIdAndDeletedAtIsNull(propertyId).stream()
		    .filter(unit -> unit.getStatus() == UnitStatus.ACTIVE)
		    .filter(unit -> unit.getBuildingId() == null || buildingIds.contains(unit.getBuildingId())).map(Unit::getId)
		    .collect(Collectors.toSet());
	}

	/** 당월 이후는 삭제된 대상의 잔여 청구를 제외하고 과거 월은 당시 확정 스냅샷을 보존합니다. */
	private boolean visibleCharge(Charge charge, YearMonth month, Set<UUID> currentUnits) {
		return "ISSUED".equals(charge.getStatus())
		    && (month.isBefore(BillingCalendar.currentMonth(clock)) || currentUnits.contains(charge.getUnitId()));
	}
}
