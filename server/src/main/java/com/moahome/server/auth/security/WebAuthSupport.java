package com.moahome.server.auth.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import com.moahome.server.auth.domain.AuthSession;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.config.SecurityProperties;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

@Component
public class WebAuthSupport {
	public static final String COOKIE_NAME = "moahome-refresh";

	public static final String COOKIE_PATH = "/api/auth/web";

	public static final String CSRF_PATH = COOKIE_PATH + "/csrf";

	public static final String REFRESH_PATH = COOKIE_PATH + "/refresh";

	public static final String LOGOUT_PATH = COOKIE_PATH + "/logout";

	public static final String SESSION_ATTRIBUTE = AuthSession.class.getName();

	private final SecurityProperties properties;

	private final Clock clock;

	public WebAuthSupport(SecurityProperties properties, Clock clock) {
		this.properties = properties;
		this.clock = clock;
	}

	public static boolean isWebAuthRequest(HttpServletRequest request) {
		String path = request.getRequestURI().substring(request.getContextPath().length());
		return ("GET".equals(request.getMethod()) && CSRF_PATH.equals(path))
		    || ("POST".equals(request.getMethod()) && (REFRESH_PATH.equals(path) || LOGOUT_PATH.equals(path)));
	}

	public String refreshToken(HttpServletRequest request) {
		Cookie[] cookies = request.getCookies();
		if (cookies == null) {
			throw new AuthException(AuthErrorCode.AUTHENTICATION_REQUIRED);
		}
		String token = null;
		for (Cookie cookie : cookies) {
			if (!COOKIE_NAME.equals(cookie.getName())) {
				continue;
			}
			if (token != null || cookie.getValue().isBlank()) {
				throw new AuthException(AuthErrorCode.INVALID_TOKEN);
			}
			token = cookie.getValue();
		}
		if (token == null) {
			throw new AuthException(AuthErrorCode.AUTHENTICATION_REQUIRED);
		}
		return token;
	}

	public void verifyOrigin(HttpServletRequest request) {
		String origin = request.getHeader("Origin");
		if (origin != null && properties.allowedOrigins().contains(origin)) {
			return;
		}
		if (origin == null && "GET".equals(request.getMethod())) {
			return;
		}
		throw new AuthException(AuthErrorCode.CSRF_INVALID);
	}

	public String refreshCookie(String token, Instant expiresAt) {
		Duration remaining = Duration.between(clock.instant(), expiresAt);
		return cookie(token).maxAge(remaining.isNegative() ? Duration.ZERO : remaining).build().toString();
	}

	public String clearCookie() {
		return cookie("").maxAge(Duration.ZERO).build().toString();
	}

	private ResponseCookie.ResponseCookieBuilder cookie(String token) {
		return ResponseCookie.from(COOKIE_NAME, token).path(COOKIE_PATH).httpOnly(true)
		    .secure(properties.cookieSecure()).sameSite("Lax");
	}
}
