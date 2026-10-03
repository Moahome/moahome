package com.moahome.server.auth.service;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.UUID;

import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.auth.domain.AuthSession;
import com.moahome.server.auth.domain.ClientType;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.repo.RedisAuthSessionRepository;
import com.moahome.server.user.exception.UserException;
import com.moahome.server.user.service.UserService;

import org.springframework.dao.DataAccessException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
	private final TokenService tokens;
	private final RedisAuthSessionRepository sessions;
	private final Clock clock;
	private final UserService users;
	private final SecureRandom random = new SecureRandom();

	public AuthService(TokenService tokens, RedisAuthSessionRepository sessions, Clock clock, UserService users) {
		this.tokens = tokens;
		this.sessions = sessions;
		this.clock = clock;
		this.users = users;
	}

	/** Only call after a login provider has verified and resolved a persisted service user. */
	public TokenService.TokenPair startSession(String verifiedUserId, ClientType clientType) {
		if (verifiedUserId == null || verifiedUserId.isBlank() || clientType == null) {
			throw new IllegalArgumentException("Verified user and client type are required");
		}
		requireActiveAccount(verifiedUserId);
		Instant now = clock.instant().truncatedTo(ChronoUnit.SECONDS);
		String sessionId = UUID.randomUUID().toString();
		Instant expiresAt = now.plus(TokenService.REFRESH_LIFETIME);
		TokenService.TokenPair pair = tokens.issue(verifiedUserId, sessionId, expiresAt);
		byte[] csrfBytes = new byte[32];
		random.nextBytes(csrfBytes);
		sessions.create(new AuthSession(sessionId, verifiedUserId, clientType, TokenService.hash(pair.refreshToken()),
			Base64.getUrlEncoder().withoutPadding().encodeToString(csrfBytes), now, expiresAt));
		return pair;
	}

	public AuthPrincipal authenticateAccess(String accessToken) {
		Jwt jwt = tokens.readAccess(accessToken);
		AuthSession session = requireSession(jwt);
		requireActiveAccount(session.userId());
		return new AuthPrincipal(session.userId(), session.sessionId());
	}

	public AuthSession authenticateRefresh(String refreshToken, ClientType clientType) {
		Jwt jwt = tokens.readRefresh(refreshToken);
		AuthSession session = requireSession(jwt);
		if (session.clientType() != clientType) {
			throw new AuthException(AuthErrorCode.INVALID_TOKEN);
		}
		requireSuccess(sessions.checkRefresh(session, TokenService.hash(refreshToken)));
		return session;
	}

	public TokenService.TokenPair refresh(String refreshToken, ClientType clientType) {
		AuthSession session = authenticateRefresh(refreshToken, clientType);
		requireActiveAccount(session.userId());
		TokenService.TokenPair pair = tokens.issue(session.userId(), session.sessionId(), session.expiresAt());
		requireSuccess(sessions.rotate(session, TokenService.hash(refreshToken), TokenService.hash(pair.refreshToken())));
		return pair;
	}

	public void logout(String refreshToken, ClientType clientType) {
		AuthSession session = authenticateRefresh(refreshToken, clientType);
		requireSuccess(sessions.logout(session, TokenService.hash(refreshToken)));
	}

	private AuthSession requireSession(Jwt jwt) {
		AuthSession session = sessions.find(jwt.getClaimAsString("sid"))
			.orElseThrow(() -> new AuthException(AuthErrorCode.SESSION_EXPIRED));
		if (!session.userId().equals(jwt.getSubject())) {
			throw new AuthException(AuthErrorCode.INVALID_TOKEN);
		}
		if (!session.expiresAt().isAfter(clock.instant())) {
			throw new AuthException(AuthErrorCode.SESSION_EXPIRED);
		}
		return session;
	}

	private void requireSuccess(long result) {
		if (result == 1) {
			return;
		}
		if (result == -1) {
			throw new AuthException(AuthErrorCode.REFRESH_TOKEN_REUSED);
		}
		if (result == -2) {
			throw new AuthException(AuthErrorCode.INVALID_TOKEN);
		}
		throw new AuthException(AuthErrorCode.SESSION_EXPIRED);
	}

	private void requireActiveAccount(String userId) {
		try {
			users.requireActive(UUID.fromString(userId));
		} catch (IllegalArgumentException exception) {
			throw new AuthException(AuthErrorCode.INVALID_TOKEN);
		} catch (UserException exception) {
			throw new AuthException(AuthErrorCode.ACCOUNT_UNAVAILABLE);
		} catch (DataAccessException exception) {
			throw new AuthException(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE);
		}
	}
}
