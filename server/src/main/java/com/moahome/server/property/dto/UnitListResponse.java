package com.moahome.server.property.dto;

import java.util.List;
import java.util.UUID;

public record UnitListResponse(UUID propertyId, boolean hasBuildings, List<BuildingItem> buildings, List<UnitResponse> units) {
	public record BuildingItem(UUID id, String name) {
	}
}
