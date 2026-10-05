package com.moahome.server.auth.security;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

import com.moahome.server.user.service.UserService;
import com.moahome.server.user.domain.SystemRole;
import com.moahome.server.user.domain.UserStatus;
import com.moahome.server.user.dto.CurrentUserResponse;
import com.moahome.server.user.repo.UserRepository;
import com.moahome.server.auth.repo.SocialAccountRepository;
import com.moahome.server.user.exception.UserErrorCode;
import com.moahome.server.user.exception.UserException;

import com.moahome.server.auth.controller.AppAuthController;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.auth.domain.ClientType;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.repo.RedisAuthSessionRepository;
import com.moahome.server.auth.service.AuthService;
import com.moahome.server.auth.service.TokenService;
import com.moahome.server.auth.support.MutableClock;
import com.moahome.server.auth.support.RedisTestServer;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import({SecurityIntegrationTest.TestBeans.class, SecurityIntegrationTest.ProbeController.class})
class SecurityIntegrationTest {
	private static final String ORIGIN = "http://localhost:3000";
	private static final RedisTestServer REDIS = new RedisTestServer();
	@Autowired private MockMvc mvc;
	@Autowired private AuthService auth;
	@Autowired private TokenService tokens;
	@Autowired private StringRedisTemplate redis;
	@Autowired private ObjectMapper mapper;
	@Autowired private MutableClock clock;
	@MockitoSpyBean private RedisAuthSessionRepository sessions;
	@MockitoBean private UserService users;
	@MockitoBean private UserRepository userRepository;
	@MockitoBean private SocialAccountRepository socialAccounts;
	@MockitoBean private com.moahome.server.property.service.PropertyRegistrationService registrations;
	@MockitoBean private com.moahome.server.property.repo.PropertyRegistrationLock registrationLock;

	@DynamicPropertySource
	static void infrastructure(DynamicPropertyRegistry registry) {
		com.moahome.server.property.support.RegistrationTestKeys.register(registry);
		byte[] accessKey = new byte[64];
		byte[] refreshKey = new byte[64];
		SecureRandom random = new SecureRandom();
		random.nextBytes(accessKey);
		random.nextBytes(refreshKey);
		String accessSecret = Base64.getEncoder().encodeToString(accessKey);
		String refreshSecret = Base64.getEncoder().encodeToString(refreshKey);
		registry.add("moahome.security.jwt-access-secret-base64", () -> accessSecret);
		registry.add("moahome.security.jwt-refresh-secret-base64", () -> refreshSecret);
		registry.add("spring.data.redis.port", REDIS::port);
	}

	@BeforeEach
	void resetTime() {
		clock.set(Instant.now().truncatedTo(ChronoUnit.SECONDS));
	}

	@AfterEach
	void resetSpies() {
		reset(sessions, users);
	}

	@AfterAll
	static void stopRedis() {
		REDIS.close();
	}

	@Test
	void requiresBearerForBusinessEndpointsAndDoesNotOpenUnknownAuthPaths() throws Exception {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.WEB);
		mvc.perform(get("/api/test/identity")).andExpect(status().isUnauthorized())
			.andExpect(jsonPath("code").value("AUTHENTICATION_REQUIRED"));
		mvc.perform(get("/api/test/identity").cookie(refreshCookie(pair))).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/auth/unknown")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/test/identity").header("Authorization", "Bearer " + pair.accessToken()))
			.andExpect(status().isOk()).andExpect(jsonPath("userId").value("00000000-0000-0000-0000-000000000001"));
		mvc.perform(post("/api/test/action").header("Authorization", "Bearer " + pair.accessToken()))
			.andExpect(status().isOk());
	}

	@Test
	void registrationEndpointsRequireBearerAndAcceptBusinessPostWithoutCsrf() throws Exception {
		UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
		UUID requestId = UUID.randomUUID();
		var pair = auth.startSession(userId.toString(), ClientType.WEB);
		for (String path : List.of("/api/property-registrations/basic-info/validate", "/api/property-registrations")) {
			mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("AUTHENTICATION_REQUIRED"))
				.andExpect(header().string("Cache-Control", "no-store"));
			mvc.perform(post(path).cookie(refreshCookie(pair)).contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("AUTHENTICATION_REQUIRED"));
		}
		mvc.perform(get("/api/property-registrations/" + requestId).cookie(refreshCookie(pair)))
			.andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("AUTHENTICATION_REQUIRED"));
		var basic = new com.moahome.server.property.dto.BasicInfoRequest("모아빌라", "주소", null, null, false);
		when(registrations.validateBasicInfo(userId, basic)).thenReturn(basic);
		mvc.perform(post("/api/property-registrations/basic-info/validate")
			.header("Authorization", "Bearer " + pair.accessToken()).contentType(MediaType.APPLICATION_JSON)
			.content(mapper.writeValueAsString(basic)))
			.andExpect(status().isOk()).andExpect(jsonPath("hasBuildings").value(false))
			.andExpect(header().string("Cache-Control", "no-store"));
		verify(registrations).validateBasicInfo(userId, basic);
		org.mockito.Mockito.doThrow(new AuthException(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE)).when(sessions).find(anyString());
		mvc.perform(post("/api/property-registrations/basic-info/validate")
			.header("Authorization", "Bearer " + pair.accessToken()).contentType(MediaType.APPLICATION_JSON)
			.content(mapper.writeValueAsString(basic)))
			.andExpect(status().isServiceUnavailable()).andExpect(jsonPath("code").value("AUTH_SERVICE_UNAVAILABLE"));
	}

	@Test
	void currentUserRequiresBearerAndUsesAuthenticatedIdentityInsteadOfRequestInput() throws Exception {
		UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
		var pair = auth.startSession(userId.toString(), ClientType.WEB);
		when(users.getCurrentUser(userId)).thenReturn(new CurrentUserResponse(userId, "모아 주민", null,
			SystemRole.USER, UserStatus.ACTIVE));

		mvc.perform(get("/api/users/me")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/users/me").cookie(refreshCookie(pair))).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/users/me").param("userId", UUID.randomUUID().toString())
			.header("Authorization", "Bearer " + pair.accessToken()))
			.andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
			.andExpect(jsonPath("id").value(userId.toString()))
			.andExpect(jsonPath("displayName").value("모아 주민"))
			.andExpect(jsonPath("profileImageUrl").value(org.hamcrest.Matchers.nullValue()))
			.andExpect(jsonPath("systemRole").value("USER"))
			.andExpect(jsonPath("status").value("ACTIVE"))
			.andExpect(jsonPath("$.length()").value(5));
		verify(users).getCurrentUser(userId);
	}

	@Test
	void currentUserRejectsAccountThatBecameUnavailableAfterAuthentication() throws Exception {
		UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
		var pair = auth.startSession(userId.toString(), ClientType.WEB);
		when(users.getCurrentUser(userId)).thenThrow(new UserException(UserErrorCode.ACCOUNT_UNAVAILABLE));

		mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + pair.accessToken()))
			.andExpect(status().isForbidden()).andExpect(header().string("Cache-Control", "no-store"))
			.andExpect(jsonPath("code").value("ACCOUNT_UNAVAILABLE"))
			.andExpect(jsonPath("displayName").doesNotExist());
	}

	@Test
	void currentUserStorageFailureReturnsSafeRetryableResponse() throws Exception {
		UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
		var pair = auth.startSession(userId.toString(), ClientType.WEB);
		when(users.getCurrentUser(userId)).thenThrow(new DataAccessResourceFailureException("private-database-detail"));

		mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + pair.accessToken()))
			.andExpect(status().isServiceUnavailable()).andExpect(header().string("Cache-Control", "no-store"))
			.andExpect(jsonPath("code").value("AUTH_SERVICE_UNAVAILABLE"))
			.andExpect(jsonPath("message").value(not(containsString("private-database-detail"))));
	}

	@Test
	void rejectsMalformedTamperedAndRefreshBearerTokens() throws Exception {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		mvc.perform(get("/api/test/identity").header("Authorization", "Bearer invalid"))
			.andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("INVALID_TOKEN"));
		mvc.perform(get("/api/test/identity").header("Authorization", "Bearer " + pair.refreshToken()))
			.andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("INVALID_TOKEN"));
		mvc.perform(get("/api/test/identity").param("access_token", pair.accessToken()))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void returnsJson403ForDeniedMethod() throws Exception {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		mvc.perform(get("/api/test/denied").header("Authorization", "Bearer " + pair.accessToken()))
			.andExpect(status().isForbidden()).andExpect(jsonPath("code").value("ACCESS_DENIED"));
	}

	@Test
	void expiredAccessCanRefreshButExpiredRefreshRequiresLogin() throws Exception {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		clock.advance(Duration.ofHours(1));
		mvc.perform(get("/api/test/identity").header("Authorization", "Bearer " + pair.accessToken()))
			.andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("ACCESS_TOKEN_EXPIRED"));
		mvc.perform(appRequest(AppAuthController.REFRESH_PATH, pair.refreshToken())
			.header("Authorization", "Bearer " + pair.accessToken()))
			.andExpect(status().isOk()).andExpect(jsonPath("refreshExpiresAt").value(pair.refreshExpiresAt().toString()));
		clock.set(pair.refreshExpiresAt());
		mvc.perform(appRequest(AppAuthController.REFRESH_PATH, pair.refreshToken()))
			.andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("REFRESH_TOKEN_EXPIRED"));
	}

	@Test
	void webRefreshRequiresOriginAndCsrfHeaderAndKeepsRefreshOutOfJson() throws Exception {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.WEB);
		String csrf = csrfToken(pair);
		mvc.perform(post(WebAuthSupport.REFRESH_PATH).cookie(refreshCookie(pair)))
			.andExpect(status().isForbidden()).andExpect(jsonPath("code").value("CSRF_INVALID"));
		mvc.perform(post(WebAuthSupport.REFRESH_PATH).cookie(refreshCookie(pair)).header("Origin", ORIGIN))
			.andExpect(status().isForbidden()).andExpect(jsonPath("code").value("CSRF_INVALID"));
		mvc.perform(post(WebAuthSupport.REFRESH_PATH).cookie(refreshCookie(pair)).header("Origin", ORIGIN).param("_csrf", csrf))
			.andExpect(status().isForbidden());
		mvc.perform(post(WebAuthSupport.REFRESH_PATH).cookie(refreshCookie(pair)).header("Origin", ORIGIN)
			.header("X-CSRF-TOKEN", csrf))
			.andExpect(status().isOk()).andExpect(jsonPath("accessToken").isNotEmpty())
			.andExpect(jsonPath("refreshToken").doesNotExist()).andExpect(header().string("Cache-Control", "no-store"))
			.andExpect(cookie().httpOnly(WebAuthSupport.COOKIE_NAME, true))
			.andExpect(cookie().secure(WebAuthSupport.COOKIE_NAME, true))
			.andExpect(cookie().path(WebAuthSupport.COOKIE_NAME, WebAuthSupport.COOKIE_PATH))
			.andExpect(header().string("Set-Cookie", containsString("SameSite=Lax")))
			.andExpect(header().string("Set-Cookie", not(containsString("Domain="))));
	}

	@Test
	void allowsOnlyConfiguredCorsOriginAndProcessesPreflightWithoutLogin() throws Exception {
		mvc.perform(options("/api/test/action").header("Origin", ORIGIN)
			.header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "Authorization"))
			.andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", ORIGIN))
			.andExpect(header().string("Access-Control-Allow-Credentials", "true"));
		mvc.perform(options("/api/test/action").header("Origin", "https://untrusted.example")
			.header("Access-Control-Request-Method", "POST"))
			.andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
	}

	@Test
	void webLogoutInvalidatesAccessImmediatelyAndPreservesOtherLogin() throws Exception {
		var webPair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.WEB);
		var appPair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		mvc.perform(post(WebAuthSupport.LOGOUT_PATH).cookie(refreshCookie(webPair)).header("Origin", ORIGIN)
			.header("X-CSRF-TOKEN", csrfToken(webPair)))
			.andExpect(status().isNoContent()).andExpect(cookie().maxAge(WebAuthSupport.COOKIE_NAME, 0));
		mvc.perform(get("/api/test/identity").header("Authorization", "Bearer " + webPair.accessToken()))
			.andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("SESSION_EXPIRED"));
		mvc.perform(get("/api/test/identity").header("Authorization", "Bearer " + appPair.accessToken()))
			.andExpect(status().isOk());
		assertThat(auth.refresh(appPair.refreshToken(), ClientType.APP).refreshToken()).isNotBlank();
	}

	@Test
	void appLogoutAcceptsRefreshAfterAccessExpiresAndDoesNotUseCookie() throws Exception {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		clock.advance(Duration.ofHours(1));
		mvc.perform(post(AppAuthController.LOGOUT_PATH).cookie(refreshCookie(pair)).contentType(MediaType.APPLICATION_JSON)
			.content("{}"))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("INVALID_REQUEST"));
		mvc.perform(appRequest(AppAuthController.LOGOUT_PATH, pair.refreshToken()))
			.andExpect(status().isNoContent());
		assertCode(() -> auth.refresh(pair.refreshToken(), ClientType.APP), AuthErrorCode.SESSION_EXPIRED);
	}

	@Test
	void cannotUseWebRefreshThroughAppRouteOrAppRefreshThroughWebRoute() throws Exception {
		var webPair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.WEB);
		var appPair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		mvc.perform(appRequest(AppAuthController.REFRESH_PATH, webPair.refreshToken()))
			.andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("INVALID_TOKEN"));
		mvc.perform(get(WebAuthSupport.CSRF_PATH).cookie(refreshCookie(appPair)).header("Origin", ORIGIN))
			.andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("INVALID_TOKEN"));
		assertThat(auth.authenticateAccess(webPair.accessToken()).userId()).isEqualTo("00000000-0000-0000-0000-000000000001");
		assertThat(auth.authenticateAccess(appPair.accessToken()).userId()).isEqualTo("00000000-0000-0000-0000-000000000001");
	}

	@Test
	void refreshReplayRevokesThatSessionIncludingNewTokens() {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		var other = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		var refreshed = auth.refresh(pair.refreshToken(), ClientType.APP);
		assertCode(() -> auth.refresh(pair.refreshToken(), ClientType.APP), AuthErrorCode.REFRESH_TOKEN_REUSED);
		assertCode(() -> auth.authenticateAccess(refreshed.accessToken()), AuthErrorCode.SESSION_EXPIRED);
		assertCode(() -> auth.refresh(refreshed.refreshToken(), ClientType.APP), AuthErrorCode.SESSION_EXPIRED);
		assertThat(auth.authenticateAccess(other.accessToken()).userId()).isEqualTo("00000000-0000-0000-0000-000000000001");
	}

	@Test
	void redisStoresOnlyRefreshHashAndRotationDoesNotExtendTtl() {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		String sid = tokens.readAccess(pair.accessToken()).getClaimAsString("sid");
		String key = "auth:session:" + sid;
		long ttlBefore = redis.getExpire(key);
		assertThat(ttlBefore).isBetween(Duration.ofDays(14).toSeconds() - 5, Duration.ofDays(14).toSeconds());
		assertThat(redis.opsForHash().entries(key).values()).doesNotContain(pair.refreshToken());
		clock.advance(Duration.ofDays(7));
		var refreshed = auth.refresh(pair.refreshToken(), ClientType.APP);
		assertThat(refreshed.refreshExpiresAt()).isEqualTo(pair.refreshExpiresAt());
		assertThat(redis.getExpire(key)).isLessThanOrEqualTo(ttlBefore);
		assertThat(redis.opsForHash().get(key, "refreshHash")).isEqualTo(TokenService.hash(refreshed.refreshToken()));
	}

	@Test
	void concurrentRefreshDoesNotAcceptTheSameTokenTwice() throws Exception {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		CountDownLatch ready = new CountDownLatch(2);
		CountDownLatch start = new CountDownLatch(1);
		Callable<Boolean> task = () -> {
			ready.countDown();
			start.await();
			try {
				auth.refresh(pair.refreshToken(), ClientType.APP);
				return true;
			} catch (AuthException exception) {
				assertThat(exception.code()).isIn(AuthErrorCode.REFRESH_TOKEN_REUSED, AuthErrorCode.SESSION_EXPIRED);
				return false;
			}
		};
		try (var executor = Executors.newFixedThreadPool(2)) {
			var first = executor.submit(task);
			var second = executor.submit(task);
			assertThat(ready.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
			start.countDown();
			assertThat(List.of(first.get(5, java.util.concurrent.TimeUnit.SECONDS), second.get(5, java.util.concurrent.TimeUnit.SECONDS)))
				.containsExactlyInAnyOrder(true, false);
		}
		assertCode(() -> auth.authenticateAccess(pair.accessToken()), AuthErrorCode.SESSION_EXPIRED);
	}

	@Test
	void deletedSessionCannotBeRecreatedByAnInFlightRotation() {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		var session = auth.authenticateRefresh(pair.refreshToken(), ClientType.APP);
		auth.logout(pair.refreshToken(), ClientType.APP);
		assertThat(sessions.rotate(session, TokenService.hash(pair.refreshToken()), "new-hash")).isZero();
		assertThat(sessions.find(session.sessionId())).isEmpty();
	}

	@Test
	void redisFailureReturns503InsteadOfAcceptingSignedJwt() throws Exception {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		doThrow(new AuthException(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE)).when(sessions).find(anyString());
		mvc.perform(get("/api/test/identity").header("Authorization", "Bearer " + pair.accessToken()))
			.andExpect(status().isServiceUnavailable()).andExpect(jsonPath("code").value("AUTH_SERVICE_UNAVAILABLE"));
		mvc.perform(appRequest(AppAuthController.REFRESH_PATH, pair.refreshToken()))
			.andExpect(status().isServiceUnavailable()).andExpect(jsonPath("code").value("AUTH_SERVICE_UNAVAILABLE"));
	}

	@Test
	void inactiveAccountCannotUseExistingAccessOrRefreshButCanLogout() throws Exception {
		String id = "00000000-0000-0000-0000-000000000001";
		var pair = auth.startSession(id, ClientType.APP);
		org.mockito.Mockito.when(users.requireActive(java.util.UUID.fromString(id)))
			.thenThrow(new UserException(UserErrorCode.ACCOUNT_UNAVAILABLE));
		mvc.perform(get("/api/test/identity").header("Authorization", "Bearer " + pair.accessToken()))
			.andExpect(status().isForbidden()).andExpect(jsonPath("code").value("ACCOUNT_UNAVAILABLE"));
		mvc.perform(appRequest(AppAuthController.REFRESH_PATH, pair.refreshToken()))
			.andExpect(status().isForbidden()).andExpect(jsonPath("code").value("ACCOUNT_UNAVAILABLE"));
		mvc.perform(appRequest(AppAuthController.LOGOUT_PATH, pair.refreshToken())).andExpect(status().isNoContent());
	}

	private String csrfToken(TokenService.TokenPair pair) throws Exception {
		String body = mvc.perform(get(WebAuthSupport.CSRF_PATH).cookie(refreshCookie(pair)).header("Origin", ORIGIN))
			.andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
			.andReturn().getResponse().getContentAsString();
		return mapper.readTree(body).get("csrfToken").asString();
	}

	private Cookie refreshCookie(TokenService.TokenPair pair) {
		return new Cookie(WebAuthSupport.COOKIE_NAME, pair.refreshToken());
	}

	private MockHttpServletRequestBuilder appRequest(String path, String refreshToken) throws Exception {
		return post(path).contentType(MediaType.APPLICATION_JSON)
			.content(mapper.writeValueAsString(Map.of("refreshToken", refreshToken)));
	}

	private void assertCode(Runnable action, AuthErrorCode code) {
		assertThatThrownBy(action::run).isInstanceOfSatisfying(AuthException.class,
			exception -> assertThat(exception.code()).isEqualTo(code));
	}

	@TestConfiguration
	static class TestBeans {
		@Bean
		@Primary
		MutableClock testClock() {
			return new MutableClock(Instant.now());
		}
	}

	@RestController
	static class ProbeController {
		@GetMapping("/api/test/identity")
		AuthPrincipal identity(@AuthenticationPrincipal AuthPrincipal principal) {
			return principal;
		}

		@PostMapping("/api/test/action")
		Map<String, String> action() {
			return Map.of("result", "ok");
		}

		@GetMapping("/api/test/denied")
		@PreAuthorize("denyAll()")
		void denied() {
		}
	}
}
