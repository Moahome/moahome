package com.moahome.server.billing.service;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.*;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.moahome.server.billing.domain.*;
import com.moahome.server.billing.dto.*;
import com.moahome.server.billing.dto.BillingResponse.*;
import com.moahome.server.billing.exception.BillingException;
import com.moahome.server.billing.repo.*;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.repo.*;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.resident.service.ResidentListService;

import static com.moahome.server.billing.exception.BillingException.Code.*;

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

	private final BillingAdditionRepository additions;

	private final BillingGenerationService generation;

	private final Clock clock;

	public BillingService(ManagementAccessService access, PropertyRepository properties, UnitRepository units,
	    BuildingRepository buildings, BillingTemplates configurations, FeeTemplateRepository templates,
	    FeeTemplateItemRepository templateItems, BillingPeriodRepository periods, ChargeRepository charges,
	    ChargeItemRepository chargeItems, ResidentListService residents, Clock clock,
	    BillingAdditionRepository additions, BillingGenerationService generation) {
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
		this.additions = additions;
		this.generation = generation;
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
		    versions.getFirst().getId(), template(current, month),
		    current.getId().equals(next.getId()) ? null : template(next, month.plusMonths(1)),
		    property.getManagementStartedAt() != null, property.isHasBuildings(),
		    buildings.findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(property.getId()).stream()
		        .map(building -> new BuildingOption(building.getId(), building.getName())).toList());
	}

	/** 조회월이 지나간 임시 항목은 응답에서 제외하고 동별 기본 항목은 동 단위로 묶습니다. */
	private Template template(FeeTemplate template, YearMonth month) {
		List<FeeTemplateItem> sources = configurations.items(template);
		Map<UUID, List<FeeTemplateItem>> groups = sources.stream()
		    .filter(item -> !item.isTemporary() && item.getBuildingId() != null)
		    .collect(Collectors.groupingBy(FeeTemplateItem::getBuildingId, LinkedHashMap::new, Collectors.toList()));
		return new Template(template.getId(), YearMonth.from(template.getEffectiveFrom()).toString(),
		    sources.stream().filter(item -> !item.isTemporary() && item.getBuildingId() == null).map(this::item).toList(),
		    template.getChangeReason(), template.getCreatedAt(), template.getBillingMode(),
		    groups.entrySet().stream().map(group -> new BuildingItems(group.getKey(),
		        group.getValue().stream().map(this::item).toList())).toList(), template.getTemporaryMode(),
		    sources.stream().filter(item -> item.isTemporary() && month.atDay(1).equals(template.getEffectiveFrom()))
		        .map(item -> new TemporaryItem(item.getId(), item.getBuildingId(), item.getItemCode(), item.getItemName(),
		            item.getDefaultAmount().toPlainString(), item.getNote())).toList());
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
		var currentMonth = BillingCalendar.currentMonth(clock);
		var nextMonth = currentMonth.plusMonths(1);
		String defaultTemporaryMonth = request.temporaryMonth() == null ? nextMonth.toString() : request.temporaryMonth();

		List<BillingSettingsRequest.TemporaryItem> currentItems = request.temporaryItems().stream()
		    .filter(item -> currentMonth.toString().equals(item.month() == null ? defaultTemporaryMonth : item.month())).toList();
		List<BillingSettingsRequest.TemporaryItem> futureItems = request.temporaryItems().stream()
		    .filter(item -> nextMonth.toString().equals(item.month() == null ? defaultTemporaryMonth : item.month())).toList();
		boolean immediate = !currentItems.isEmpty();
		String fingerprint = fingerprint(request);
		if (request.requestId() != null) {
			var existing = additions.findByPropertyIdAndRequestId(propertyId, request.requestId());
			if (existing.isPresent()) {
				if (!existing.get().getRequestFingerprint().equals(fingerprint) || !userId.equals(existing.get().getCreatedBy()))
					throw new BillingException(BILLING_SETTINGS_CONFLICT);
				return readSettings(property);
			}
		}
		for (var item : request.temporaryItems()) {
			String month = item.month() == null ? defaultTemporaryMonth : item.month();
			if (!currentMonth.toString().equals(month) && !nextMonth.toString().equals(month))
				throw new BillingException(BILLING_SETTINGS_CONFLICT);
		}
		List<FeeTemplate> versions = configurations.versions(propertyId);
		if (versions.isEmpty() || !versions.getFirst().getId().equals(request.revisionId())
		    || !nextMonth.toString().equals(request.effectiveMonth()))
			throw new BillingException(BILLING_SETTINGS_CONFLICT);
		if (immediate && (request.requestId() == null || request.temporaryItems().isEmpty()
		    || property.getManagementStartedAt() == null || currentMonth.isBefore(BillingCalendar.firstMonth(property))))
			throw new IllegalArgumentException("Current billing addition unavailable");
		validateSettings(property, request, immediate);
		long revision = versions.getFirst().getRevision();
		var next = configurations.applicable(versions, nextMonth);
		List<FeeTemplateItem> preserved = immediate && request.temporaryItems().stream().allMatch(item -> item.month() == null)
		    && next.getEffectiveFrom().equals(nextMonth.atDay(1))
		    ? configurations.items(next).stream().filter(FeeTemplateItem::isTemporary).toList() : List.of();
		if (immediate)
			createAddition(userId, propertyId, request, currentItems, currentMonth, ++revision, fingerprint);
		var version = FeeTemplate.schedule(propertyId, revision + 1,
		    nextMonth, request.reason(), userId, OffsetDateTime.now(clock));
		version.configureModes(request.mode(), !preserved.isEmpty() ? next.getTemporaryMode() : request.temporaryMode());
		templates.saveAndFlush(version);
		var at = version.getCreatedAt();
		List<FeeTemplateItem> saved = new ArrayList<>();
		for (var input : request.items())
			saved.add(FeeTemplateItem.scoped(version, input.itemCode(), input.itemName(), input.defaultAmount(),
			    saved.size(), null, false, null, at));
		for (var group : request.buildingItems())
			for (var input : group.items())
				saved.add(FeeTemplateItem.scoped(version, input.itemCode(), input.itemName(), input.defaultAmount(),
				    saved.size(), group.buildingId(), false, null, at));
		if (!preserved.isEmpty()) {
			for (var input : preserved)
				saved.add(FeeTemplateItem.scoped(version, input.getItemCode(), input.getItemName(), input.getDefaultAmount().longValueExact(),
				    saved.size(), input.getBuildingId(), true, input.getNote(), at));
		} else {
			for (var input : futureItems)
				saved.add(FeeTemplateItem.scoped(version, input.itemCode(), input.itemName(), input.defaultAmount(),
				    saved.size(), input.buildingId(), true, input.note(), at));
		}
		templateItems.saveAllAndFlush(saved);
		if (immediate) {
			List<UUID> targetBuildings = buildings.findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(propertyId)
			    .stream().map(Building::getId).toList();
			for (UUID target : targetBuildings.isEmpty() ? Collections.<UUID>singletonList(null) : targetBuildings)
				requireAmountRange(configurations.applicableItems(version, saved, nextMonth, target).stream()
				    .map(FeeTemplateItem::getDefaultAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
		}
		return readSettings(property);
	}

	/** 이번 달 기본 청구를 준비한 뒤 별도 추가 부과를 발행합니다. 이후 실패하면 설정 변경까지 모두 롤백합니다. */
	private void createAddition(UUID actor, UUID property, BillingSettingsRequest request, List<BillingSettingsRequest.TemporaryItem> currentItems, YearMonth month,
	    long revision, String fingerprint) {
		generation.supplementCurrentMonth(property);
		var period = periods.findByPropertyIdAndBillingYearAndBillingMonth(property, (short) month.getYear(), (short) month.getMonthValue())
		    .orElseThrow(() -> new BillingException(BILLING_CHARGE_NOT_FOUND));
		var at = OffsetDateTime.now(clock);
		var source = templates.saveAndFlush(FeeTemplate.addition(property, revision, month, request.reason(), actor, request.temporaryMode(), at));
		List<FeeTemplateItem> sources = new ArrayList<>();
		for (var input : currentItems)
			sources.add(FeeTemplateItem.scoped(source, input.itemCode(), input.itemName(), input.defaultAmount(),
			    sources.size(), input.buildingId(), true, input.note(), at));
		templateItems.saveAllAndFlush(sources);
		additions.saveAndFlush(BillingAddition.create(period, source, request.requestId(), fingerprint, actor, at));
		generation.supplementCurrentMonth(property);
	}

	/** 요청 원문은 로그에 남기지 않고 정규화 DTO의 지문만 보존해 응답 유실 재시도의 중복 부과를 막습니다. */
	private String fingerprint(BillingSettingsRequest request) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
			    .digest(request.toString().getBytes(StandardCharsets.UTF_8)));
		} catch (NoSuchAlgorithmException exception) {
			throw new IllegalStateException("Billing request digest unavailable", exception);
		}
	}

	/** 모든 현재 동의 설정·동 소속과 기본+임시의 세대당 최종 합계를 저장 전에 검증합니다. */
	private void validateSettings(Property property, BillingSettingsRequest request, boolean immediate) {
		List<UUID> buildingIds = buildings.findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(property.getId())
		    .stream().map(Building::getId).toList();
		if (request.mode() == BillingMode.ALL) {
			if (request.items().isEmpty() || !request.buildingItems().isEmpty())
				throw new IllegalArgumentException("Invalid all-building configuration");
		} else {
			List<UUID> configured = request.buildingItems().stream().map(BillingSettingsRequest.BuildingItems::buildingId).toList();
			if (!property.isHasBuildings() || !request.items().isEmpty() || configured.size() != buildingIds.size()
			    || !new HashSet<>(configured).equals(new HashSet<>(buildingIds)))
				throw new IllegalArgumentException("Invalid building configuration");
		}
		for (var item : request.temporaryItems()) {
			if ((request.temporaryMode() == BillingMode.ALL && item.buildingId() != null)
			    || (request.temporaryMode() == BillingMode.BUILDING
			        && (!property.isHasBuildings() || !buildingIds.contains(item.buildingId()))))
				throw new IllegalArgumentException("Invalid temporary target");
		}
		List<UUID> targets = buildingIds.isEmpty() ? Collections.singletonList(null) : buildingIds;
		for (UUID buildingId : targets) {
			List<BillingSettingsRequest.Item> base = request.mode() == BillingMode.ALL ? request.items()
			    : request.buildingItems().stream().filter(group -> group.buildingId().equals(buildingId))
			        .findFirst().orElseThrow().items();
			BigDecimal total = base.stream().map(item -> BigDecimal.valueOf(item.defaultAmount()))
			    .reduce(BigDecimal.ZERO, BigDecimal::add);
			requireAmountRange(total);
			BigDecimal extra = request.temporaryItems().stream()
			    .filter(item -> item.month() == null ? !immediate : item.month().equals(request.effectiveMonth()))
			    .filter(item -> request.temporaryMode() == BillingMode.ALL || Objects.equals(item.buildingId(), buildingId))
			    .map(item -> BigDecimal.valueOf(item.defaultAmount())).reduce(BigDecimal.ZERO, BigDecimal::add);
			requireAmountRange(total.add(extra));
		}
	}

	private void requireAmountRange(BigDecimal amount) {
		if (amount.abs().compareTo(BigDecimal.valueOf(999_999_999_999_999L)) > 0)
			throw new IllegalArgumentException("Invalid total");
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
		Map<UUID, String> names = buildings.findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(propertyId)
		    .stream().collect(Collectors.toMap(Building::getId, Building::getName));
		Map<UUID, String> representatives = representativeNames(userId, propertyId, context.role());
		List<BillingResponse.ChargeRow> rows = units.findByPropertyIdAndDeletedAtIsNull(propertyId).stream()
		    .filter(unit -> unit.getStatus() == UnitStatus.ACTIVE)
		    .filter(unit -> unit.getBuildingId() == null || names.containsKey(unit.getBuildingId()))
		    .map(unit -> new ChargeRow(unit.getId(), unit.getId(), names.getOrDefault(unit.getBuildingId(), ""),
		        unit.getUnitNumber(), unit.getDisplayName(), representatives.get(unit.getId()),
		        configurations.applicableItems(template, items, month, unit.getBuildingId()).stream().map(this::item).toList()))
		    .toList();
		return new Month(propertyId, property.isHasBuildings(), month.toString(), month.atDay(1), month.atEndOfMonth(),
		    "SCHEDULED", rows.isEmpty() ? "0" : rows.getFirst().items().stream()
		        .map(item -> new BigDecimal(item.amount())).reduce(BigDecimal.ZERO, BigDecimal::add).toPlainString(), rows);
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
		Map<UUID, List<Charge>> byUnit = headers.stream().collect(Collectors.groupingBy(Charge::getUnitId));
		List<BillingResponse.ChargeRow> rows = byUnit.values().stream().map(group -> {
			var primary = group.stream().filter(charge -> charge.getBillingAdditionId() == null).findFirst().orElse(group.getFirst());
			List<Item> combined = group.stream().sorted(Comparator.comparing(Charge::getIssuedAt).thenComparing(Charge::getId))
			    .flatMap(charge -> snapshots.getOrDefault(charge.getId(), List.of()).stream())
			    .map(item -> new Item(item.getId(), item.getItemCode(), item.getItemName(), item.getAmount().toPlainString())).toList();
			return new ChargeRow(primary.getId(), primary.getUnitId(), primary.getBuildingName(), primary.getUnitNumber(),
			    primary.getDisplayName(), representatives.get(primary.getUnitId()), combined);
		}).toList();
		String base = rows.isEmpty() ? "0" : rows.getFirst().items().stream().map(item -> new BigDecimal(item.amount()))
		    .reduce(BigDecimal.ZERO, BigDecimal::add).toPlainString();
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
			        (int) rows.stream().map(Charge::getUnitId).distinct().count(), total.toPlainString(), period.getConfirmedAt());
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
