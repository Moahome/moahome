package com.moahome.server.resident.service;

import java.util.UUID;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.domain.BuildingStatus;
import com.moahome.server.property.repo.BuildingRepository;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.resident.domain.ResidentSignupStatus;
import com.moahome.server.resident.dto.ResidentListResponse;
import com.moahome.server.resident.dto.ResidentListResponse.*;
import com.moahome.server.resident.repo.ResidentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ResidentListService {
	private final ManagementAccessService access;
	private final PropertyRepository properties;
	private final BuildingRepository buildings;
	private final ResidentRepository residents;

	public ResidentListService(ManagementAccessService access, PropertyRepository properties,
		BuildingRepository buildings, ResidentRepository residents) {
		this.access = access;
		this.properties = properties;
		this.buildings = buildings;
		this.residents = residents;
	}

	/** 현재 관리소장 권한을 먼저 검사하고 소프트 삭제되지 않은 전체 명부와 현재 세대 소속을 조회합니다. */
	public ResidentListResponse list(UUID userId, UUID propertyId) {
		var context = access.getManagementContext(userId, propertyId);
		// 공통 관리자 틀은 부담당자도 사용하므로 주민 명부의 관리소장 전용 권한을 별도로 검증합니다.
		if (context.role() != PropertyMemberRole.ADMIN) throw new AuthException(AuthErrorCode.ACCESS_DENIED);
		var property = properties.findById(propertyId).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		var buildingItems = buildings.findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(propertyId).stream()
			.filter(building -> building.getStatus() == BuildingStatus.ACTIVE)
			.map(building -> new ResidentBuildingItem(building.getId(), building.getName())).toList();
		var items = residents.findDirectory(propertyId).stream().map(row -> new ResidentItem(row.getId(), row.getName(),
			row.getPhoneLast4(), row.getUnitId(), row.getBuildingId(), row.getUnitNumber(), row.getRelationType(),
			row.getRepresentative(), ResidentSignupStatus.from(row.getApproved(), row.getPending()), row.getServiceRole())).toList();
		return new ResidentListResponse(propertyId, property.isHasBuildings(), buildingItems, items);
	}
}
