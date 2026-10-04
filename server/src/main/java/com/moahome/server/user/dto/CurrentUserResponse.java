package com.moahome.server.user.dto;

import java.util.UUID;

import com.moahome.server.user.domain.SystemRole;
import com.moahome.server.user.domain.UserStatus;

/** 로그인 화면과 전역 세션에 필요한 계정 정보만 공개합니다. 소셜 식별자와 내부 이력은 제외합니다. */
public record CurrentUserResponse(UUID id, String displayName, String profileImageUrl,
	SystemRole systemRole, UserStatus status) {
}
