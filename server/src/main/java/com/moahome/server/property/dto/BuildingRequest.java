package com.moahome.server.property.dto;

import com.moahome.server.common.validation.TextInput;
import com.moahome.server.property.domain.Building;

public record BuildingRequest(@TextInput(max = 50) String name) {
	/** 초기 등록과 같은 동 접미사 정리를 적용한 이름으로 길이와 중복을 검증합니다. */
	public BuildingRequest {
		name = Building.normalizeName(name);
	}
}
