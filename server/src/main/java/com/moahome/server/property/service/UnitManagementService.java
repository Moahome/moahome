package com.moahome.server.property.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.List;
import java.util.HashSet;
import java.util.HashMap;
import java.util.Map;
import java.util.LinkedHashMap;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.dto.*;
import com.moahome.server.property.exception.UnitManagementException;
import com.moahome.server.property.repo.*;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.resident.service.ResidentListService;
import com.moahome.server.resident.domain.ResidentSignupStatus;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static com.moahome.server.property.exception.UnitManagementException.Code.*;

@Service
@Transactional(readOnly = true)
public class UnitManagementService {
	private final ManagementAccessService access;
	private final PropertyRepository properties;
	private final BuildingRepository buildings;
	private final UnitRepository units;
	private final Clock clock;
	private final ResidentListService residents;

	public UnitManagementService(ManagementAccessService access, PropertyRepository properties,
		BuildingRepository buildings, UnitRepository units, Clock clock, ResidentListService residents) {
		this.access = access;
		this.properties = properties;
		this.buildings = buildings;
		this.units = units;
		this.clock = clock;
		this.residents = residents;
	}

	/** 매 요청의 현재 관리 권한을 확인한 뒤 저장된 세대와 동 구분을 읽습니다. 초안·등록 결과를 조회하지 않습니다. */
	public UnitListResponse list(UUID userId, UUID propertyId) {
		var context = access.getManagementContext(userId, propertyId);
		var property = properties.findById(propertyId).orElseThrow(() -> new UnitManagementException(UNIT_NOT_FOUND));
		var buildingItems = buildings.findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(propertyId).stream()
			.filter(building -> building.getStatus() == BuildingStatus.ACTIVE)
			.map(building -> new UnitListResponse.BuildingItem(building.getId(), building.getName())).toList();
		var items = units.findByPropertyIdAndDeletedAtIsNull(propertyId).stream().map(UnitResponse::from).toList();
		// 세대 조회를 허용받은 부담당자에게 관리소장 전용 주민 명부가 우회 노출되지 않도록 합니다.
		var summaries = context.role() == PropertyMemberRole.ADMIN ? summarizeResidents(userId, propertyId, items) : null;
		return new UnitListResponse(propertyId, property.isHasBuildings(), buildingItems, items, summaries);
	}

	/** 주민 목록의 현재 소속·삭제·가입 판정을 그대로 재사용하고 한 번의 명부 조회로 세대별 집계합니다. */
	private Map<UUID, UnitListResponse.ResidentSummary> summarizeResidents(UUID userId, UUID propertyId, List<UnitResponse> items) {
		var grouped = residents.list(userId, propertyId).residents().stream()
			.filter(resident -> resident.unitId() != null)
			.collect(Collectors.groupingBy(resident -> resident.unitId()));
		var result = new LinkedHashMap<UUID, UnitListResponse.ResidentSummary>();
		for (var unit : items) {
			var current = grouped.getOrDefault(unit.id(), List.of());
			var representativeName = current.stream().filter(resident -> resident.representative())
				.map(resident -> resident.name()).findFirst().orElse(null);
			int approved = (int) current.stream().filter(resident -> resident.signupStatus() == ResidentSignupStatus.APPROVED).count();
			int pending = (int) current.stream().filter(resident -> resident.signupStatus() == ResidentSignupStatus.PENDING).count();
			result.put(unit.id(), new UnitListResponse.ResidentSummary(representativeName, current.size(), approved, pending,
				current.size() - approved - pending));
		}
		return result;
	}

	/** 관리대상 잠금 아래 중복 호수를 확인하고 기존 세대 스키마에 한 세대만 추가합니다. */
	@Transactional
	public UnitResponse create(UUID userId, UUID propertyId, UnitRequest request) {
		var property = requireWritableProperty(userId, propertyId);
		var building = requireBuilding(property, request.buildingId());
		var unit = Unit.create(property, building, request.unitNumber(), request.displayName(), request.floor(),
			UnitStatus.valueOf(request.status()), OffsetDateTime.now(clock));
		requireUniqueNumber(propertyId, request, unit.getId());
		return UnitResponse.from(units.saveAndFlush(unit));
	}

	/** URL의 관리대상과 세대 소속을 함께 검증하고 기존 ID를 유지해 기본 정보만 변경합니다. */
	@Transactional
	public UnitResponse update(UUID userId, UUID propertyId, UUID unitId, UnitRequest request) {
		var property = requireWritableProperty(userId, propertyId);
		var unit = units.findByIdAndPropertyIdAndDeletedAtIsNull(unitId, propertyId)
			.orElseThrow(() -> new UnitManagementException(UNIT_NOT_FOUND));
		if (unit.getStatus() == UnitStatus.INACTIVE) throw new UnitManagementException(UNIT_NOT_EDITABLE);
		var building = requireBuilding(property, request.buildingId());
		requireUniqueNumber(propertyId, request, unitId);
		unit.updateDetails(property, building, request.unitNumber(), request.displayName(), request.floor(), UnitStatus.valueOf(request.status()));
		units.flush();
		return UnitResponse.from(unit);
	}

	/** 일괄 추가는 같은 잠금·트랜잭션에서 전체 검증 후 저장하여 중간 실패 시 일부 세대만 남지 않게 합니다. */
	@Transactional
	public List<UnitResponse> createBatch(UUID userId, UUID propertyId, UnitBatchRequest batch) {
		var property = requireWritableProperty(userId, propertyId);
		var seen = new HashSet<List<String>>();
		// 삭제된 호수도 현재 유일성 제약에 포함하며 일괄 추가 수만큼 중복 쿼리를 반복하지 않습니다.
		units.findByPropertyId(propertyId).forEach(unit ->
			seen.add(List.of(String.valueOf(unit.getBuildingId()), unit.getUnitNumber())));
		var buildingCache = new HashMap<UUID, Building>();
		var additions = batch.units().stream().map(request -> {
			var building = request.buildingId() == null ? requireBuilding(property, null)
				: buildingCache.computeIfAbsent(request.buildingId(), id -> requireBuilding(property, id));
			var unit = Unit.create(property, building, request.unitNumber(), request.displayName(), request.floor(),
				UnitStatus.valueOf(request.status()), OffsetDateTime.now(clock));
			var key = List.of(String.valueOf(request.buildingId()), request.unitNumber());
			if (!seen.add(key)) throw new UnitManagementException(DUPLICATE_UNIT);
			return unit;
		}).toList();
		return units.saveAllAndFlush(additions).stream().map(UnitResponse::from).toList();
	}

	/** 동 구분을 바꾸지 않고 동 있음 대상에 새 동을 추가하며 대상 잠금으로 이름 중복을 직렬화합니다. */
	@Transactional
	public UnitListResponse.BuildingItem createBuilding(UUID userId, UUID propertyId, BuildingRequest request) {
		var property = requireWritableProperty(userId, propertyId);
		if (!property.isHasBuildings()) throw new UnitManagementException(INVALID_REQUEST);
		var current = buildings.findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(propertyId);
		int order = current.stream().mapToInt(Building::getSortOrder).max().orElse(-1) + 1;
		var building = Building.create(property, request.name(), order, OffsetDateTime.now(clock));
		requireUniqueBuildingName(propertyId, building.getName(), building.getId());
		building = buildings.saveAndFlush(building);
		return new UnitListResponse.BuildingItem(building.getId(), building.getName());
	}

	/** 기존 동의 소속·활성 상태를 검사하고 현재 이름만 수정합니다. 연결 세대의 ID는 변경하지 않습니다. */
	@Transactional
	public UnitListResponse.BuildingItem updateBuilding(UUID userId, UUID propertyId, UUID buildingId, BuildingRequest request) {
		var property = requireWritableProperty(userId, propertyId);
		var building = requireBuilding(property, buildingId);
		if (building == null) throw new UnitManagementException(INVALID_REQUEST);
		requireUniqueBuildingName(propertyId, request.name(), buildingId);
		building.rename(request.name());
		buildings.flush();
		return new UnitListResponse.BuildingItem(building.getId(), building.getName());
	}

	/** 대상 전체의 소속을 먼저 확인한 뒤 같은 트랜잭션에서 소프트 삭제해 부분 삭제를 방지합니다. */
	@Transactional
	public void deleteUnits(UUID userId, UUID propertyId, List<UUID> unitIds) {
		requireWritableProperty(userId, propertyId);
		var requested = new HashSet<>(unitIds);
		var targets = units.findByPropertyIdAndIdIn(propertyId, requested);
		if (targets.size() != requested.size()) throw new UnitManagementException(UNIT_NOT_FOUND);
		var at = OffsetDateTime.now(clock);
		targets.forEach(unit -> unit.softDelete(userId, at));
		units.flush();
	}

	/** 확인 창의 범위대로 동과 연결 세대를 함께 제외하며 다른 동·계좌·등록 결과는 변경하지 않습니다. */
	@Transactional
	public void deleteBuilding(UUID userId, UUID propertyId, UUID buildingId) {
		requireWritableProperty(userId, propertyId);
		var building = buildings.findByIdAndPropertyId(buildingId, propertyId)
			.orElseThrow(() -> new UnitManagementException(UNIT_NOT_FOUND));
		if (building.getDeletedAt() != null) return;
		var at = OffsetDateTime.now(clock);
		units.findByPropertyIdAndBuildingIdAndDeletedAtIsNull(propertyId, buildingId)
			.forEach(unit -> unit.softDelete(userId, at));
		building.softDelete(userId, at);
		// 같은 관리대상 잠금을 추가·수정과 공유하므로 동 삭제와 새 세대 연결이 교차하지 않습니다.
		units.flush();
		buildings.flush();
	}

	/** 기존 DB의 삭제되지 않은 동 이름 유일성 범위와 같은 조건을 사용합니다. */
	private void requireUniqueBuildingName(UUID propertyId, String name, UUID buildingId) {
		if (buildings.existsByPropertyIdAndNameAndDeletedAtIsNullAndIdNot(propertyId, name, buildingId)) {
			throw new UnitManagementException(DUPLICATE_BUILDING);
		}
	}

	/** 기존 관리자 진입 검증을 재사용하며 같은 대상의 세대 쓰기를 직렬화합니다. */
	private Property requireWritableProperty(UUID userId, UUID propertyId) {
		access.getManagementContext(userId, propertyId);
		return properties.findForUnitUpdate(propertyId).orElseThrow(() -> new UnitManagementException(UNIT_NOT_FOUND));
	}

	/** 동 없음에는 연결을 금지하고 동 있음에는 같은 관리대상의 활성 동만 연결합니다. */
	private Building requireBuilding(Property property, UUID buildingId) {
		if (!property.isHasBuildings()) {
			if (buildingId != null) throw new UnitManagementException(INVALID_REQUEST);
			return null;
		}
		if (buildingId == null) throw new UnitManagementException(INVALID_REQUEST);
		return buildings.findByIdAndPropertyIdAndDeletedAtIsNull(buildingId, property.getId())
			.filter(building -> building.getStatus() == BuildingStatus.ACTIVE)
			.orElseThrow(() -> new UnitManagementException(INVALID_REQUEST));
	}

	/** 삭제된 번호 재사용 정책은 확정 전이므로 현재 DB의 유일성 제약과 같은 범위를 검사합니다. */
	private void requireUniqueNumber(UUID propertyId, UnitRequest request, UUID unitId) {
		if (units.existsByPropertyIdAndBuildingIdAndUnitNumberAndIdNot(propertyId, request.buildingId(), request.unitNumber(), unitId)) {
			throw new UnitManagementException(DUPLICATE_UNIT);
		}
	}
}
