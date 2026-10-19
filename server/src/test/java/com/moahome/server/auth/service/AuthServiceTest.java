package com.moahome.server.auth.service;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import com.moahome.server.auth.domain.AuthSession;
import com.moahome.server.auth.domain.ClientType;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.repo.RedisAuthSessionRepository;

import com.moahome.server.user.service.UserService;
import com.moahome.server.user.exception.UserErrorCode;
import com.moahome.server.user.exception.UserException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AuthServiceTest {
	private final Instant now = Instant.parse("2026-10-03T00:00:00Z");

	private TokenService tokens;

	private RedisAuthSessionRepository sessions;

	private AuthService auth;

	private UserService users;

	@BeforeEach
	void setUp() {
		tokens = mock(TokenService.class);
		sessions = mock(RedisAuthSessionRepository.class);
		users = mock(UserService.class);
		auth = new AuthService(tokens, sessions, Clock.fixed(now, ZoneOffset.UTC), users);
	}

	@Test
	void rejectsUserMismatchWithoutChangingAnotherUsersSession() {
		when(tokens.readRefresh("refresh")).thenReturn(jwt("another-user"));
		when(sessions.find("session-1")).thenReturn(Optional.of(session(ClientType.APP)));
		assertCode(() -> auth.logout("refresh", ClientType.APP), AuthErrorCode.INVALID_TOKEN);
		verify(sessions, never()).logout(session(ClientType.APP), TokenService.hash("refresh"));
	}

	@Test
	void rejectsWrongClientBeforeRefreshStateChanges() {
		when(tokens.readRefresh("refresh")).thenReturn(jwt("00000000-0000-0000-0000-000000000001"));
		when(sessions.find("session-1")).thenReturn(Optional.of(session(ClientType.WEB)));
		assertCode(() -> auth.refresh("refresh", ClientType.APP), AuthErrorCode.INVALID_TOKEN);
		verify(sessions, never()).checkRefresh(session(ClientType.WEB), TokenService.hash("refresh"));
	}

	@Test
	void rejectsMissingSessionInsteadOfAcceptingValidJwt() {
		when(tokens.readAccess("access")).thenReturn(jwt("00000000-0000-0000-0000-000000000001"));
		when(sessions.find("session-1")).thenReturn(Optional.empty());
		assertCode(() -> auth.authenticateAccess("access"), AuthErrorCode.SESSION_EXPIRED);
	}

	@Test
	void rejectsInactiveAccountsForAccessRefreshAndSessionCreation() {
		String id = "00000000-0000-0000-0000-000000000001";
		when(users.requireActive(UUID.fromString(id))).thenThrow(new UserException(UserErrorCode.ACCOUNT_UNAVAILABLE));
		when(tokens.readAccess("access")).thenReturn(jwt(id));
		when(tokens.readRefresh("refresh")).thenReturn(jwt(id));
		when(sessions.find("session-1")).thenReturn(Optional.of(session(ClientType.APP)));
		when(sessions.checkRefresh(session(ClientType.APP), TokenService.hash("refresh"))).thenReturn(1L);
		assertCode(() -> auth.authenticateAccess("access"), AuthErrorCode.ACCOUNT_UNAVAILABLE);
		assertCode(() -> auth.refresh("refresh", ClientType.APP), AuthErrorCode.ACCOUNT_UNAVAILABLE);
		assertCode(() -> auth.startSession(id, ClientType.APP), AuthErrorCode.ACCOUNT_UNAVAILABLE);
		verify(tokens, never()).issue(org.mockito.ArgumentMatchers.anyString(),
		    org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any());
	}

	private Jwt jwt(String userId) {
		return Jwt.withTokenValue("verified-token").header("alg", "HS256").subject(userId).claim("sid", "session-1")
		    .build();
	}

	private AuthSession session(ClientType clientType) {
		return new AuthSession("session-1", "00000000-0000-0000-0000-000000000001", clientType,
		    TokenService.hash("refresh"), "csrf", now, now.plusSeconds(60));
	}

	private void assertCode(Runnable action, AuthErrorCode code) {
		assertThatThrownBy(action::run).isInstanceOfSatisfying(AuthException.class,
		    exception -> assertThat(exception.code()).isEqualTo(code));
	}
}
