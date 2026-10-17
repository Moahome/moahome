package com.moahome.server.resident.dto;

import java.util.List;
import java.util.UUID;
import com.moahome.server.resident.domain.ResidentSignupStatus;

/** 명부 전체와 동 필터에 필요한 정보만 반환하며 전체 연락처와 계정 식별자는 포함하지 않습니다. */
public record ResidentListResponse(UUID propertyId, boolean hasBuildings, List<ResidentBuildingItem> buildings,
	List<ResidentItem> residents) {
	public record ResidentBuildingItem(UUID id, String name) { }
	public record ResidentItem(UUID id, String name, String phoneLast4, UUID unitId, UUID buildingId,
		String unitNumber, String relationType, boolean representative, ResidentSignupStatus signupStatus, String serviceRole) {
        public ResidentItem(UUID id,String name,String phoneLast4,UUID unitId,UUID buildingId,String unitNumber,String relationType,boolean representative,ResidentSignupStatus signupStatus) {
            this(id,name,phoneLast4,unitId,buildingId,unitNumber,relationType,representative,signupStatus,null);
        }
    }
}
