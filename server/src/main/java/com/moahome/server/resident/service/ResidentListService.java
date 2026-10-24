package com.moahome.server.resident.service;

import java.util.UUID;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
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
import java.util.List;

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

	/** 현재 관리자 권한을 먼저 검사하고 소프트 삭제되지 않은 전체 명부와 현재 세대 소속을 조회합니다. */
	public ResidentListResponse list(UUID userId, UUID propertyId) {
		access.getManagementContext(userId, propertyId);
		var property = properties.findById(propertyId)
		    .orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		List<ResidentListResponse.ResidentBuildingItem> buildingItems = buildings
		    .findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(propertyId).stream()
		    .filter(building -> building.getStatus() == BuildingStatus.ACTIVE)
		    .map(building -> new ResidentBuildingItem(building.getId(), building.getName())).toList();
		List<ResidentListResponse.ResidentItem> items = residents.findDirectory(propertyId).stream()
		    .map(row -> new ResidentItem(row.getId(), row.getName(), row.getPhoneLast4(), row.getUnitId(),
		        row.getBuildingId(), row.getUnitNumber(), row.getRelationType(), row.getRepresentative(),
		        ResidentSignupStatus.from(row.getApproved(), row.getPending()), row.getServiceRole()))
		    .toList();
		return new ResidentListResponse(propertyId, property.isHasBuildings(), buildingItems, items);
	}
}
