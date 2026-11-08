package com.moahome.server.auth.domain;

import java.time.Instant;

public record AuthSession(String sessionId, String userId, ClientType clientType, String refreshHash, String csrfToken,
    Instant loginAt, Instant expiresAt, long accountVersion, boolean recoveryOnly) {
	/** 기존 세션은 최초 인증 세대의 일반 세션으로 호환합니다. */
	public AuthSession(String sessionId, String userId, ClientType clientType, String refreshHash, String csrfToken,
	    Instant loginAt, Instant expiresAt) {
		this(sessionId, userId, clientType, refreshHash, csrfToken, loginAt, expiresAt, 0, false);
	}

	@Override
	public String toString() {
		return "AuthSession[REDACTED]";
	}
}
