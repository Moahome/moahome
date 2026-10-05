package com.moahome.server.property.dto;

import com.moahome.server.common.validation.TextInput;
import com.moahome.server.common.validation.TextValues;
import jakarta.validation.constraints.NotNull;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "문자열은 앞뒤 공백 제거 후 Unicode 코드 포인트 수로 검증합니다. 계약 밖 필드와 타입 자동 변환은 허용하지 않습니다.",
	additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
public record BasicInfoRequest(
	@Schema(description = "관리대상 이름", example = "모아빌라", minLength = 1, maxLength = 50, requiredMode = Schema.RequiredMode.REQUIRED)
	@TextInput(max = 50) String name,
	@Schema(description = "기본 주소", example = "서울특별시 예시로 10", minLength = 1, maxLength = 255, requiredMode = Schema.RequiredMode.REQUIRED)
	@TextInput(max = 255) String address,
	@Schema(description = "상세 주소. 생략 / null / 공백은 null로 정리", example = "정문 옆", maxLength = 255, nullable = true)
	@TextInput(max = 255, optional = true) String addressDetail,
	@Schema(description = "건물 유형. 선택적인 문자열", example = "빌라", maxLength = 30, nullable = true)
	@TextInput(max = 30, optional = true) String propertyType,
	@Schema(description = "동 구분 사용 여부. false도 정상 입력", example = "true")
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
