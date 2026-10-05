package com.moahome.server.user.dto;

import java.util.UUID;

import com.moahome.server.user.domain.SystemRole;
import com.moahome.server.user.domain.UserStatus;
import io.swagger.v3.oas.annotations.media.Schema;

/** 로그인 화면과 전역 세션에 필요한 계정 정보만 공개합니다. 소셜 식별자와 내부 이력은 제외합니다. */
public record CurrentUserResponse(UUID id,
	@Schema(description = "로그인 계정의 닉네임", example = "모아 사용자") String displayName,
	@Schema(description = "선택적인 프로필 이미지 URL", nullable = true) String profileImageUrl,
	@Schema(description = "플랫폼 역할. 관리대상별 역할과 구분") SystemRole systemRole,
	@Schema(description = "계정 상태. 정상 조회 응답은 ACTIVE") UserStatus status) {
}
