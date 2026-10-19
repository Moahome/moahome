package com.moahome.server.auth.domain;

import java.time.Instant;
import java.util.Set;

public record OAuthLoginAttempt(String state, String browserHash, String codeVerifier, Instant expiresAt,
    String clientId, String redirectUri, String authorizationUri, Set<String> scopes) {
	public OAuthLoginAttempt {
		scopes = Set.copyOf(scopes);
	}

	@Override
	public String toString() {
		return "OAuthLoginAttempt[REDACTED]";
	}
}
