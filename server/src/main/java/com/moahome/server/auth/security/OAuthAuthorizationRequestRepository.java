package com.moahome.server.auth.security;

import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import java.util.regex.Pattern;

import com.moahome.server.auth.domain.OAuthLoginAttempt;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.repo.RedisOAuthStateRepository;
import com.moahome.server.auth.service.TokenService;
import com.moahome.server.config.SecurityProperties;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.crypto.keygen.Base64StringKeyGenerator;
import org.springframework.security.oauth2.client.web.AuthorizationRequestRepository;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.stereotype.Component;

@Component
public class OAuthAuthorizationRequestRepository implements AuthorizationRequestRepository<OAuth2AuthorizationRequest> {
	public static final Duration LIFETIME = Duration.ofMinutes(5);

	public static final String COOKIE_PREFIX = "moahome-oauth-";

	private static final Pattern RANDOM_VALUE = Pattern.compile("[A-Za-z0-9_-]{43}");

	private final Base64StringKeyGenerator random = new Base64StringKeyGenerator(
	    Base64.getUrlEncoder().withoutPadding(), 32);

	private final RedisOAuthStateRepository states;

	private final SecurityProperties security;

	private final Clock clock;

	public OAuthAuthorizationRequestRepository(RedisOAuthStateRepository states, SecurityProperties security,
	    Clock clock) {
		this.states = states;
		this.security = security;
		this.clock = clock;
	}

	@Override
	public void saveAuthorizationRequest(OAuth2AuthorizationRequest authorization, HttpServletRequest request,
	    HttpServletResponse response) {
		if (authorization == null) {
			removeAuthorizationRequest(request, response);
			return;
		}
		String browserToken = random.generateKey();
		var attempt = new OAuthLoginAttempt(authorization.getState(), TokenService.hash(browserToken),
		    authorization.getAttribute("code_verifier"), clock.instant().plus(LIFETIME), authorization.getClientId(),
		    authorization.getRedirectUri(), authorization.getAuthorizationUri(), authorization.getScopes());
		try {
			states.create(attempt);
		} catch (AuthException exception) {
			throw unavailable();
		}
		response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
		response.addHeader(HttpHeaders.SET_COOKIE, cookie(attempt.state(), browserToken, LIFETIME));
	}

	@Override
	public OAuth2AuthorizationRequest loadAuthorizationRequest(HttpServletRequest request) {
		return read(request, false);
	}

	@Override
	public OAuth2AuthorizationRequest removeAuthorizationRequest(HttpServletRequest request,
	    HttpServletResponse response) {
		try {
			return read(request, true);
		} finally {
			clearCookie(request, response);
		}
	}

	public void clearCookie(HttpServletRequest request, HttpServletResponse response) {
		String state = state(request);
		if (state != null) {
			response.addHeader(HttpHeaders.SET_COOKIE, cookie(state, "", Duration.ZERO));
		}
	}

	private OAuth2AuthorizationRequest read(HttpServletRequest request, boolean consume) {
		String state = state(request);
		String browserToken = browserToken(request, state);
		if (state == null || browserToken == null) {
			return null;
		}
		try {
			return states.load(state, TokenService.hash(browserToken), consume)
			    .map(attempt -> OAuth2AuthorizationRequest.authorizationCode().state(attempt.state())
			        .clientId(attempt.clientId()).authorizationUri(attempt.authorizationUri())
			        .redirectUri(attempt.redirectUri()).scopes(attempt.scopes())
			        .attributes(Map.of("registration_id", "kakao", "code_verifier", attempt.codeVerifier())).build())
			    .orElse(null);
		} catch (AuthException exception) {
			throw unavailable();
		}
	}

	private String state(HttpServletRequest request) {
		String[] values = request.getParameterValues("state");
		if (values == null || values.length != 1 || !RANDOM_VALUE.matcher(values[0]).matches()) {
			return null;
		}
		return values[0];
	}

	private String browserToken(HttpServletRequest request, String state) {
		if (state == null || request.getCookies() == null) {
			return null;
		}
		String value = null;
		for (Cookie cookie : request.getCookies()) {
			if (!(COOKIE_PREFIX + state).equals(cookie.getName())) {
				continue;
			}
			if (value != null || !RANDOM_VALUE.matcher(cookie.getValue()).matches()) {
				return null;
			}
			value = cookie.getValue();
		}
		return value;
	}

	private String cookie(String state, String value, Duration age) {
		return ResponseCookie.from(COOKIE_PREFIX + state, value).path("/").httpOnly(true)
		    .secure(security.cookieSecure()).sameSite("Lax").maxAge(age).build().toString();
	}

	private OAuth2AuthenticationException unavailable() {
		return new OAuth2AuthenticationException(new OAuth2Error("AUTH_SERVICE_UNAVAILABLE"),
		    "OAuth state storage unavailable");
	}
}
