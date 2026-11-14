package com.moahome.server.common.error;

import io.swagger.v3.oas.annotations.media.Schema;

/** 인증 필터와 업무 Controller가 공유하는 오류 응답입니다. 기존 OpenAPI 스키마 이름은 호환을 위해 유지합니다. */
@Schema(name = "AuthErrorResponse", description = "공통 오류 응답. 입력 원문과 토큰은 포함하지 않습니다.")
public record ErrorResponse(@Schema(example = "AUTHENTICATION_REQUIRED") String code,
    @Schema(example = "인증이 필요합니다.") String message) {
}
