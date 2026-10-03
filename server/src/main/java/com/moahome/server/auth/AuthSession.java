package com.moahome.server.auth;

import java.time.Instant;

public record AuthSession(
	String sessionId,
	String userId,
	ClientType clientType,
	String refreshHash,
	String csrfToken,
	Instant loginAt,
	Instant expiresAt
) {
}
