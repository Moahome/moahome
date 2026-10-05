package com.moahome.server.property.dto;

import com.moahome.server.common.validation.TextInput;
import com.moahome.server.common.validation.TextValues;
import jakarta.validation.constraints.NotNull;

public record BasicInfoRequest(
	@TextInput(max = 50) String name,
	@TextInput(max = 255) String address,
	@TextInput(max = 255, optional = true) String addressDetail,
	@TextInput(max = 30, optional = true) String propertyType,
	@NotNull(message = "REQUIRED") Boolean hasBuildings
) {
	/** 검증과 응답, 중복 비교가 모두 같은 정규화 값을 사용하도록 입력을 정리합니다. */
	public BasicInfoRequest {
		name = TextValues.strip(name);
		address = TextValues.strip(address);
		addressDetail = TextValues.optional(addressDetail);
		propertyType = TextValues.optional(propertyType);
	}
}
