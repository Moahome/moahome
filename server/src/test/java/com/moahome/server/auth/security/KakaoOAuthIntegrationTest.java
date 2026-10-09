package com.moahome.server.auth.security;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import com.moahome.server.auth.domain.ClientType;
import com.moahome.server.auth.domain.VerifiedSocialProfile;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.repo.RedisAuthSessionRepository;
import com.moahome.server.auth.repo.RedisOAuthStateRepository;
import com.moahome.server.auth.repo.SocialAccountRepository;
import com.moahome.server.auth.service.AuthService;
import com.moahome.server.auth.service.SocialAccountService;
import com.moahome.server.auth.service.TokenService;
import com.moahome.server.auth.support.MutableClock;
import com.moahome.server.auth.support.RedisTestServer;
import com.moahome.server.config.KakaoOAuthConfig;
import com.moahome.server.config.KakaoOAuthProperties;
import com.moahome.server.user.exception.UserErrorCode;
import com.moahome.server.user.exception.UserException;
import com.moahome.server.user.repo.UserRepository;
import com.moahome.server.user.service.UserService;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withBadRequest;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(KakaoOAuthIntegrationTest.TestBeans.class)
class KakaoOAuthIntegrationTest {
	private static final RedisTestServer REDIS = new RedisTestServer();
	private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
	private static final String TOKEN_URI = "https://kauth.kakao.com/oauth/token";
	private static final String USER_URI = "https://kapi.kakao.com/v2/user/me?secure_resource=true"
		+ "&property_keys=%5B%22kakao_account.profile%22%2C%22kakao_account.email%22%5D";
	private static final String USER_RESPONSE = """
		{"id":1234567890123,"kakao_account":{"profile":{"nickname":"카카오 사용자"}}}
		""";
	@Autowired private MockMvc mvc;
	@Autowired private StringRedisTemplate redis;
	@Autowired private RedisOAuthStateRepository states;
	@Autowired private MutableClock clock;
	@Autowired private MockRestServiceServer kakao;
	@Autowired private KakaoOAuthProperties properties;
	@Autowired private AuthService auth;
	@Autowired private TokenService tokens;
	@Autowired private ObjectMapper mapper;
	@MockitoSpyBean private RedisOAuthStateRepository stateRepository;
	@MockitoSpyBean private RedisAuthSessionRepository sessions;
	@MockitoBean private com.moahome.server.property.service.ManagementAccessService management;
	@MockitoBean private SocialAccountService identities;
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
	void prepare() {
		clock.set(Instant.now());
		when(identities.resolveVerifiedUser(any())).thenReturn(USER_ID);
	}

	@AfterEach
	void clean() {
		kakao.verify();
		kakao.reset();
		reset(stateRepository, sessions, identities, users);
		redis.getConnectionFactory().getConnection().serverCommands().flushDb();
	}

	@AfterAll
	static void stopRedis() {
		REDIS.close();
	}

	@Test
	void startsWithPkceAndBrowserBindingAndUsesIndependentCookiesForTabs() throws Exception {
		var first = start();
		var second = start();
		assertThat(first.state()).isNotEqualTo(second.state());
		assertThat(first.cookie().getName()).isNotEqualTo(second.cookie().getName());
		assertThat(first.cookie().isHttpOnly()).isTrue();
		assertThat(first.cookie().getSecure()).isTrue();
		assertThat(first.cookie().getPath()).isEqualTo("/");
		assertThat(first.cookie().getMaxAge()).isEqualTo(300);
		assertThat(first.result().getResponse().getHeaders("Set-Cookie").getFirst()).contains("SameSite=Lax").doesNotContain("Domain=");
		assertThat(first.result().getRequest().getSession(false)).isNull();
		Map<Object, Object> stored = redis.opsForHash().entries("auth:oauth:" + first.state());
		assertThat(stored.get("browserHash")).isEqualTo(TokenService.hash(first.cookie().getValue()));
		assertThat(stored.values()).doesNotContain(first.cookie().getValue(), properties.clientSecret());
		assertThat(redis.getExpire("auth:oauth:" + first.state())).isBetween(295L, 300L);
		assertThat(challenge((String) stored.get("verifier"))).isEqualTo(first.challenge());
		assertThat(first.result().getResponse().getRedirectedUrl()).doesNotContain("code_verifier", properties.clientSecret());
		assertThat(UriComponentsBuilder.fromUriString(first.result().getResponse().getRedirectedUrl())
			.build().getQueryParams()).doesNotContainKey("prompt");
	}

	@Test
	void requestsLoginPromptForAccountSwitchAndCompletesPkceCallback() throws Exception {
		var attempt = start("login");
		var query = UriComponentsBuilder.fromUriString(attempt.result().getResponse().getRedirectedUrl()).build().getQueryParams();
		assertThat(query.get("prompt")).containsExactly("login");
		assertThat(URLDecoder.decode(query.getFirst("redirect_uri"), StandardCharsets.UTF_8)).isEqualTo(properties.redirectUri().toString());
		assertThat(attempt.cookie().isHttpOnly()).isTrue();
		assertThat(attempt.cookie().getSecure()).isTrue();
		expectLogin(attempt, USER_RESPONSE);
		callback(attempt).andExpect(status().isFound())
			.andExpect(header().string("Location", properties.webLoginSuccessUri().toString()))
			.andExpect(cookie().httpOnly(WebAuthSupport.COOKIE_NAME, true))
			.andExpect(cookie().maxAge(attempt.cookie().getName(), 0));
		assertThat(redis.hasKey("auth:oauth:" + attempt.state())).isFalse();
	}

	@Test
	void doesNotForwardUnsupportedPromptOrOtherProviderOptions() throws Exception {
		var result = mvc.perform(get(KakaoOAuthConfig.START_PATH).param("prompt", "consent")
			.param("login_hint", "untrusted-hint").param("scope", "talk_message"))
			.andExpect(status().isFound()).andReturn();
		var query = UriComponentsBuilder.fromUriString(result.getResponse().getRedirectedUrl()).build().getQueryParams();
		assertThat(query).doesNotContainKeys("prompt", "login_hint");
		assertThat(query.getFirst("scope")).isEqualTo("profile_nickname");
	}

	@Test
	void logsInWithVerifiedProfileAndRefreshCookieThenUsesExistingCsrfAndRotation() throws Exception {
		var attempt = start();
		expectLogin(attempt, USER_RESPONSE);
		var result = callback(attempt).andExpect(status().isFound())
			.andExpect(cookie().httpOnly(WebAuthSupport.COOKIE_NAME, true))
			.andExpect(cookie().secure(WebAuthSupport.COOKIE_NAME, true))
			.andExpect(cookie().path(WebAuthSupport.COOKIE_NAME, WebAuthSupport.COOKIE_PATH))
			.andExpect(cookie().maxAge(attempt.cookie().getName(), 0)).andReturn();
		assertThat(result.getResponse().getRedirectedUrl()).isEqualTo(properties.webLoginSuccessUri().toString());
		assertThat(result.getResponse().getContentAsString()).isEmpty();
		assertThat(result.getResponse().getHeader("Cache-Control")).isEqualTo("no-store");
		assertThat(result.getRequest().getSession(false)).isNull();
		assertThat(redis.hasKey("auth:oauth:" + attempt.state())).isFalse();
		var profile = ArgumentCaptor.forClass(VerifiedSocialProfile.class);
		verify(identities).resolveVerifiedUser(profile.capture());
		assertThat(profile.getValue().providerUserId()).isEqualTo("1234567890123");
		assertThat(profile.getValue().displayName()).isEqualTo("카카오 사용자");
		assertThat(profile.getValue().providerEmail()).isNull();
		var refresh = result.getResponse().getCookie(WebAuthSupport.COOKIE_NAME);
		assertThat(auth.authenticateRefresh(refresh.getValue(), ClientType.WEB).userId()).isEqualTo(USER_ID.toString());
		var csrf = mvc.perform(get(WebAuthSupport.CSRF_PATH).cookie(refresh)).andExpect(status().isOk()).andReturn();
		String csrfToken = mapper.readTree(csrf.getResponse().getContentAsString()).get("csrfToken").asString();
		mvc.perform(post(WebAuthSupport.REFRESH_PATH).cookie(refresh).header("Origin", "https://app.example.test")
			.header("X-CSRF-TOKEN", csrfToken)).andExpect(status().isOk()).andExpect(jsonPath("accessToken").isNotEmpty())
			.andExpect(jsonPath("refreshToken").doesNotExist());
		callback(attempt).andExpect(status().isFound())
			.andExpect(header().string("Location", failure("OAUTH_STATE_INVALID")));
	}

	@Test
	void refusesMissingExpiredWrongBrowserAndDuplicatedStateWithoutCallingKakao() throws Exception {
		var attempt = start();
		mvc.perform(get(KakaoOAuthConfig.CALLBACK_PATH).param("code", "code").param("state", attempt.state()))
			.andExpect(status().isFound()).andExpect(header()
				.string("Location", failure("OAUTH_STATE_INVALID")));
		mvc.perform(get(KakaoOAuthConfig.CALLBACK_PATH).param("code", "code").cookie(attempt.cookie()))
			.andExpect(status().isFound());
		mvc.perform(get(KakaoOAuthConfig.CALLBACK_PATH).param("code", "code").param("state", attempt.state(), attempt.state())
			.cookie(attempt.cookie())).andExpect(status().isFound());
		mvc.perform(get(KakaoOAuthConfig.CALLBACK_PATH).param("code", "code").param("state", attempt.state())
			.cookie(new Cookie(attempt.cookie().getName(), "x".repeat(43)))).andExpect(status().isFound());
		mvc.perform(get(KakaoOAuthConfig.CALLBACK_PATH).param("code", "code").param("state", attempt.state())
			.cookie(attempt.cookie(), attempt.cookie())).andExpect(status().isFound());
		assertThat(redis.hasKey("auth:oauth:" + attempt.state())).isTrue();
		clock.advance(Duration.ofMinutes(5));
		callback(attempt).andExpect(status().isFound());
		assertThat(redis.hasKey("auth:oauth:" + attempt.state())).isFalse();
		verifyNoInteractions(identities);
	}

	@Test
	void cancellationAndMalformedCallbacksConsumeOnlyTheirOwnValidatedAttempt() throws Exception {
		var attempt = start();
		var other = start();
		mvc.perform(get(KakaoOAuthConfig.CALLBACK_PATH).param("error", "access_denied").param("state", attempt.state())
			.param("error_description", "private-provider-message").cookie(attempt.cookie())).andExpect(status().isFound())
			.andExpect(header().string("Location", failure("LOGIN_CANCELLED")));
		assertThat(redis.hasKey("auth:oauth:" + attempt.state())).isFalse();
		assertThat(redis.hasKey("auth:oauth:" + other.state())).isTrue();
		mvc.perform(get(KakaoOAuthConfig.CALLBACK_PATH).param("state", other.state()).cookie(other.cookie()))
			.andExpect(status().isFound());
		assertThat(redis.hasKey("auth:oauth:" + other.state())).isFalse();
		verifyNoInteractions(identities);
	}

	@Test
	void tokenFailureAndInvalidProfileNeverCreateServiceSession() throws Exception {
		var attempt = start();
		kakao.expect(requestTo(TOKEN_URI)).andRespond(withBadRequest().body("{\"error\":\"invalid_grant\",\"error_description\":\"private\"}")
			.contentType(MediaType.APPLICATION_JSON));
		callback(attempt).andExpect(status().isFound()).andExpect(cookie().doesNotExist(WebAuthSupport.COOKIE_NAME));
		kakao.verify();
		kakao.reset();
		var invalid = start();
		expectLogin(invalid, "{\"id\":42,\"kakao_account\":{}}");
		callback(invalid).andExpect(status().isFound()).andExpect(cookie().doesNotExist(WebAuthSupport.COOKIE_NAME))
			.andExpect(header().string("Location", failure("OAUTH_PROFILE_INVALID")));
		verifyNoInteractions(identities);
		assertThat(redis.keys("auth:session:*")).isEmpty();
	}

	@Test
	void userLookupFailureDoesNotCreateSessionAndCannotReuseConsumedState() throws Exception {
		var attempt = start();
		kakao.expect(requestTo(TOKEN_URI)).andRespond(withSuccess(
			"{\"access_token\":\"test-kakao-token\",\"token_type\":\"bearer\",\"expires_in\":3600}", MediaType.APPLICATION_JSON));
		kakao.expect(requestTo(USER_URI)).andRespond(withBadRequest().body("private-provider-response"));
		callback(attempt).andExpect(status().isFound()).andExpect(cookie().doesNotExist(WebAuthSupport.COOKIE_NAME))
			.andExpect(header().string("Location", failure("OAUTH_PROVIDER_UNAVAILABLE")));
		assertThat(redis.hasKey("auth:oauth:" + attempt.state())).isFalse();
		callback(attempt).andExpect(status().isFound()).andExpect(header().string("Location", failure("OAUTH_STATE_INVALID")));
		verifyNoInteractions(identities);
	}

	@Test
	void inactiveAccountAndSessionCreationFailureReturnSafeErrorWithoutRefreshCookie() throws Exception {
		var attempt = start();
		expectLogin(attempt, USER_RESPONSE);
		when(identities.resolveVerifiedUser(any())).thenThrow(new UserException(UserErrorCode.ACCOUNT_UNAVAILABLE));
		callback(attempt).andExpect(status().isFound()).andExpect(cookie().doesNotExist(WebAuthSupport.COOKIE_NAME))
			.andExpect(header().string("Location", failure("ACCOUNT_UNAVAILABLE")));
		kakao.verify();
		kakao.reset();
		reset(identities);
		when(identities.resolveVerifiedUser(any())).thenReturn(USER_ID);
		var retry = start();
		expectLogin(retry, USER_RESPONSE);
		doThrow(new AuthException(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE)).when(sessions).create(any());
		callback(retry).andExpect(status().isFound()).andExpect(cookie().doesNotExist(WebAuthSupport.COOKIE_NAME))
			.andExpect(header().string("Location", failure("AUTH_SERVICE_UNAVAILABLE")));
		assertThat(redis.hasKey("auth:oauth:" + retry.state())).isFalse();
	}

	@Test
	void redisFailuresAtStartOrCallbackDoNotFallBackToUnverifiedLogin() throws Exception {
		doThrow(new AuthException(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE)).when(stateRepository).create(any());
		mvc.perform(get(KakaoOAuthConfig.START_PATH)).andExpect(status().isFound())
			.andExpect(header().string("Location", failure("AUTH_SERVICE_UNAVAILABLE")));
		reset(stateRepository);
		var attempt = start();
		doThrow(new AuthException(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE)).when(stateRepository).load(anyString(), anyString(), anyBoolean());
		callback(attempt).andExpect(status().isFound()).andExpect(cookie().doesNotExist(WebAuthSupport.COOKIE_NAME))
			.andExpect(header().string("Location", failure("AUTH_SERVICE_UNAVAILABLE")));
		verifyNoInteractions(identities);
	}

	@Test
	void consumesStateAtomicallyUnderConcurrentCallbacks() throws Exception {
		var attempt = start();
		CountDownLatch ready = new CountDownLatch(2);
		CountDownLatch begin = new CountDownLatch(1);
		Callable<Boolean> consume = () -> {
			ready.countDown();
			assertThat(begin.await(5, TimeUnit.SECONDS)).isTrue();
			return states.load(attempt.state(), TokenService.hash(attempt.cookie().getValue()), true).isPresent();
		};
		try (var executor = Executors.newFixedThreadPool(2)) {
			var first = executor.submit(consume);
			var second = executor.submit(consume);
			assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
			begin.countDown();
			assertThat(List.of(first.get(5, TimeUnit.SECONDS), second.get(5, TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
		}
	}

	@Test
	void exposesOnlyExactGetLoginRoutesAndUsesFixedConfiguredRedirects() throws Exception {
		for (String path : List.of("/api/auth/unknown", "/oauth2/authorization/other", "/login/oauth2/code/other", "/login")) {
			mvc.perform(get(path)).andExpect(status().isUnauthorized());
		}
		mvc.perform(post(KakaoOAuthConfig.START_PATH)).andExpect(status().isUnauthorized());
		mvc.perform(post(KakaoOAuthConfig.CALLBACK_PATH)).andExpect(status().isUnauthorized());
		var result = mvc.perform(get(KakaoOAuthConfig.START_PATH).param("redirect_uri", "https://evil.example")
			.param("next", "https://evil.example").param("prompt", "login").header("Host", "evil.example")
			.header("Authorization", "Bearer expired-or-invalid")).andExpect(status().isFound()).andReturn();
		var query = UriComponentsBuilder.fromUriString(result.getResponse().getRedirectedUrl()).build().getQueryParams();
		assertThat(URLDecoder.decode(query.getFirst("redirect_uri"), StandardCharsets.UTF_8)).isEqualTo(properties.redirectUri().toString());
	}

	private Attempt start() throws Exception {
		return start(null);
	}

	private Attempt start(String prompt) throws Exception {
		var request = get(KakaoOAuthConfig.START_PATH);
		if (prompt != null) {
			request.param("prompt", prompt);
		}
		var result = mvc.perform(request).andExpect(status().isFound()).andReturn();
		var query = UriComponentsBuilder.fromUriString(result.getResponse().getRedirectedUrl()).build().getQueryParams();
		String state = query.getFirst("state");
		assertThat(query.getFirst("code_challenge_method")).isEqualTo("S256");
		assertThat(state).matches("[A-Za-z0-9_-]{43}");
		return new Attempt(state, query.getFirst("code_challenge"), result.getResponse().getCookie(OAuthAuthorizationRequestRepository.COOKIE_PREFIX + state), result);
	}

	private org.springframework.test.web.servlet.ResultActions callback(Attempt attempt) throws Exception {
		return mvc.perform(get(KakaoOAuthConfig.CALLBACK_PATH).secure(true).with(request -> {
			request.setScheme("https");
			request.setServerName("api.example.test");
			request.setServerPort(443);
			return request;
		})
			.param("code", "test-authorization-code").param("state", attempt.state()).cookie(attempt.cookie()));
	}

	private void expectLogin(Attempt attempt, String userResponse) {
		kakao.expect(requestTo(TOKEN_URI)).andExpect(method(HttpMethod.POST)).andExpect(request -> {
			String body = ((MockClientHttpRequest) request).getBodyAsString();
			Map<String, String> form = java.util.Arrays.stream(body.split("&")).map(pair -> pair.split("=", 2))
				.collect(Collectors.toMap(pair -> pair[0], pair -> URLDecoder.decode(pair[1], StandardCharsets.UTF_8)));
			assertThat(form).containsEntry("client_id", properties.clientId()).containsEntry("client_secret", properties.clientSecret())
				.containsEntry("grant_type", "authorization_code").containsEntry("code", "test-authorization-code")
				.containsEntry("redirect_uri", properties.redirectUri().toString());
			assertThat(challenge(form.get("code_verifier"))).isEqualTo(attempt.challenge());
		}).andRespond(withSuccess("{\"access_token\":\"test-kakao-token\",\"token_type\":\"bearer\",\"expires_in\":3600}", MediaType.APPLICATION_JSON));
		kakao.expect(requestTo(USER_URI)).andExpect(method(HttpMethod.GET))
			.andExpect(org.springframework.test.web.client.match.MockRestRequestMatchers.header("Authorization", "Bearer test-kakao-token"))
			.andRespond(withSuccess(userResponse, MediaType.APPLICATION_JSON));
	}

	private String challenge(String verifier) {
		try {
			return Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256")
				.digest(verifier.getBytes(StandardCharsets.US_ASCII)));
		} catch (java.security.NoSuchAlgorithmException exception) {
			throw new AssertionError(exception);
		}
	}

	private String failure(String code) {
		return "https://app.example.test/login?error=" + code;
	}

	private record Attempt(String state, String challenge, Cookie cookie, MvcResult result) {
	}

	@TestConfiguration
	static class TestBeans {
		private final RestClient.Builder builder = RestClient.builder();
		private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();

		@Bean
		MockRestServiceServer mockKakaoServer() {
			return server;
		}

		@Bean
		@Primary
		RestClient testKakaoClient() {
			return builder.build();
		}

		@Bean
		@Primary
		MutableClock testClock() {
			return new MutableClock(Instant.now());
		}
	}
}
