package com.moahome.server.property.dto;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public record UnitListResponse(UUID propertyId, boolean hasBuildings, List<BuildingItem> buildings,
	List<UnitResponse> units, Map<UUID, ResidentSummary> residentSummaries) {
	public record BuildingItem(UUID id, String name) {
	}
	/** 주민 명부 조회 권한이 없으면 요약 전체를 null로 반환하며 연락처·계정 ID는 포함하지 않습니다. */
	public record ResidentSummary(String representativeName, int total, int approved, int pending, int notJoined) { }
}
