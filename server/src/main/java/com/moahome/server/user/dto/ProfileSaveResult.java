package com.moahome.server.user.dto;

/** 잠금 아래 교체된 이전 사진은 트랜잭션 확정 이후 저장소 정리에만 사용합니다. */
public record ProfileSaveResult(CurrentUserResponse user, String previousImageUrl) {
}
