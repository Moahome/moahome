package com.moahome.server.property.dto;

import java.util.UUID;
import com.moahome.server.property.domain.Unit;
import com.moahome.server.property.domain.UnitStatus;

public record UnitResponse(UUID id, UUID buildingId, String unitNumber, String displayName, Short floor, UnitStatus status) {
	public static UnitResponse from(Unit unit) {
		return new UnitResponse(unit.getId(), unit.getBuildingId(), unit.getUnitNumber(), unit.getDisplayName(),
			unit.getFloor(), unit.getStatus());
	}
}
