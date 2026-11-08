package com.moahome.server.auth.service;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
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
		return createSession(verifiedUserId, clientType, false, users.authenticationVersion(UUID.fromString(verifiedUserId)));
	}

	/** 소셜 인증된 유예 계정에는 일반 업무 권한 대신 10분짜리 복구 전용 쿠키 세션을 발급합니다. */
	public WebLoginResult startWebLoginSession(UUID userId) {
		boolean recovery = users.requiresAccountRecovery(userId);
		TokenService.TokenPair pair = recovery
		    ? createSession(userId.toString(), ClientType.WEB, true, users.recoveryAuthenticationVersion(userId))
		    : startSession(userId.toString(), ClientType.WEB);
		return new WebLoginResult(pair, recovery);
	}

	private TokenService.TokenPair createSession(String userId, ClientType clientType, boolean recovery, long version) {
		Instant now = clock.instant().truncatedTo(ChronoUnit.SECONDS);
		String sessionId = UUID.randomUUID().toString();
		Instant expiresAt = now.plus(recovery ? Duration.ofMinutes(10) : TokenService.REFRESH_LIFETIME);
		TokenService.TokenPair pair = tokens.issue(userId, sessionId, expiresAt);
		byte[] csrfBytes = new byte[32];
		random.nextBytes(csrfBytes);
		sessions.create(new AuthSession(sessionId, userId, clientType, TokenService.hash(pair.refreshToken()),
		    Base64.getUrlEncoder().withoutPadding().encodeToString(csrfBytes), now, expiresAt, version, recovery));
		return pair;
	}

	public AuthPrincipal authenticateAccess(String accessToken) {
		Jwt jwt = tokens.readAccess(accessToken);
		AuthSession session = requireSession(jwt);
		if (session.recoveryOnly()) {
			throw new AuthException(AuthErrorCode.ACCOUNT_RECOVERY_REQUIRED);
		}
		requireActiveAccount(session.userId());
		verifyAccountVersion(session);
		return new AuthPrincipal(session.userId(), session.sessionId());
	}

	public AuthSession authenticateRefresh(String refreshToken, ClientType clientType) {
		Jwt jwt = tokens.readRefresh(refreshToken);
		AuthSession session = requireSession(jwt);
		if (session.clientType() != clientType) {
			throw new AuthException(AuthErrorCode.INVALID_TOKEN);
		}
		verifyAccountVersion(session);
		requireSuccess(sessions.checkRefresh(session, TokenService.hash(refreshToken)));
		return session;
	}

	public TokenService.TokenPair refresh(String refreshToken, ClientType clientType) {
		AuthSession session = authenticateRefresh(refreshToken, clientType);
		if (session.recoveryOnly()) {
			throw new AuthException(AuthErrorCode.ACCOUNT_RECOVERY_REQUIRED);
		}
		requireActiveAccount(session.userId());
		TokenService.TokenPair pair = tokens.issue(session.userId(), session.sessionId(), session.expiresAt());
		requireSuccess(
		    sessions.rotate(session, TokenService.hash(refreshToken), TokenService.hash(pair.refreshToken())));
		return pair;
	}

	public void logout(String refreshToken, ClientType clientType) {
		AuthSession session = authenticateRefresh(refreshToken, clientType);
		requireSuccess(sessions.logout(session, TokenService.hash(refreshToken)));
	}

	/** 복구는 정상 DB 반영 후 새 일반 세션으로 교체합니다. 기존 복구 쿠키는 업무 토큰으로 승격하지 않습니다. */
	public TokenService.TokenPair completeRecoverySession(AuthSession session) {
		if (!session.recoveryOnly() || session.clientType() != ClientType.WEB) {
			throw new AuthException(AuthErrorCode.ACCESS_DENIED);
		}
		TokenService.TokenPair pair = startSession(session.userId(), ClientType.WEB);
		requireSuccess(sessions.logout(session, session.refreshHash()));
		return pair;
	}

	private void verifyAccountVersion(AuthSession session) {
		try {
			users.verifyAuthenticationVersion(UUID.fromString(session.userId()), session.accountVersion());
		} catch (UserException exception) {
			throw new AuthException(AuthErrorCode.ACCOUNT_UNAVAILABLE);
		} catch (DataAccessException exception) {
			throw new AuthException(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE);
		}
	}

	public record WebLoginResult(TokenService.TokenPair tokens, boolean recoveryRequired) {
		@Override
		public String toString() {
			return "WebLoginResult[REDACTED]";
		}
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
