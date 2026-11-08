package com.moahome.server.user.dto;

import java.time.OffsetDateTime;

/** 복구 전용 쿠키로 본인 유예 상태만 반환하며 일반 서비스 토큰은 공개하지 않습니다. */
public record AccountRecoveryResponse(String state, String displayName, OffsetDateTime requestedAt,
    OffsetDateTime recoverableUntil, String csrfToken) {
	@Override
	public String toString() {
		return "AccountRecoveryResponse[REDACTED]";
	}
}
