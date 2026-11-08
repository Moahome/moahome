package com.moahome.server.user.dto;

import com.moahome.server.common.validation.TextInput;
import com.moahome.server.common.validation.TextValues;
import io.swagger.v3.oas.annotations.media.Schema;

public record ProfileUpdateRequest(
    @Schema(description = "계정 표시 이름. 앞뒤 공백 제거 후 1~50 Unicode 코드 포인트", minLength = 1, maxLength = 50) @TextInput(max = 50) String displayName) {

	/** 표시 이름은 공통 문자열 규칙으로 정리하며 계정 ID·이미지·권한은 입력받지 않습니다. */
	public ProfileUpdateRequest {
		displayName = TextValues.strip(displayName);
	}
}
