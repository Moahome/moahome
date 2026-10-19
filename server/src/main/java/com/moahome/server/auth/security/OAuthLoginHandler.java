package com.moahome.server.auth.security;

import java.io.IOException;

import com.moahome.server.auth.domain.ClientType;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.service.KakaoOAuthUserService.KakaoUser;
import com.moahome.server.auth.service.SocialLoginService;
import com.moahome.server.config.KakaoOAuthProperties;
import com.moahome.server.user.exception.UserException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

@Component
public class OAuthLoginHandler implements AuthenticationSuccessHandler, AuthenticationFailureHandler {
	private final SocialLoginService logins;

	private final WebAuthSupport web;

	private final KakaoOAuthProperties properties;

	private final OAuthAuthorizationRequestRepository requests;

	public OAuthLoginHandler(SocialLoginService logins, WebAuthSupport web, KakaoOAuthProperties properties,
	    OAuthAuthorizationRequestRepository requests) {
		this.logins = logins;
		this.web = web;
		this.properties = properties;
		this.requests = requests;
	}

	@Override
	public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
	    Authentication authentication) throws IOException {
		try {
			if (!(authentication.getPrincipal() instanceof KakaoUser user)) {
				redirectFailure(response, "OAUTH_LOGIN_FAILED");
				return;
			}
			var pair = logins.loginVerified(user.profile(), ClientType.WEB);
			response.addHeader(HttpHeaders.SET_COOKIE, web.refreshCookie(pair.refreshToken(), pair.refreshExpiresAt()));
			redirect(response, properties.webLoginSuccessUri().toString());
		} catch (UserException exception) {
			redirectFailure(response, "ACCOUNT_UNAVAILABLE");
		} catch (AuthException exception) {
			redirectFailure(response, exception.code().name());
		} catch (RuntimeException exception) {
			redirectFailure(response, "AUTH_SERVICE_UNAVAILABLE");
		} finally {
			SecurityContextHolder.clearContext();
		}
	}

	@Override
	public void onAuthenticationFailure(HttpServletRequest request, HttpServletResponse response,
	    AuthenticationException exception) throws IOException {
		String code = failureCode(exception);
		try {
			requests.removeAuthorizationRequest(request, response);
		} catch (OAuth2AuthenticationException unavailable) {
			code = "AUTH_SERVICE_UNAVAILABLE";
		}
		SecurityContextHolder.clearContext();
		redirectFailure(response, code);
	}

	private String failureCode(Throwable failure) {
		for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
			if (!(cause instanceof OAuth2AuthenticationException oauth)) {
				continue;
			}
			return switch (oauth.getError().getErrorCode()) {
			case "access_denied" -> "LOGIN_CANCELLED";
			case "authorization_request_not_found", "invalid_state_parameter", "invalid_request" ->
			    "OAUTH_STATE_INVALID";
			case "AUTH_SERVICE_UNAVAILABLE" -> "AUTH_SERVICE_UNAVAILABLE";
			case "OAUTH_PROFILE_INVALID" -> "OAUTH_PROFILE_INVALID";
			default -> "OAUTH_PROVIDER_UNAVAILABLE";
			};
		}
		return "OAUTH_LOGIN_FAILED";
	}

	private void redirectFailure(HttpServletResponse response, String code) throws IOException {
		redirect(response, properties.webLoginSuccessUri().resolve("/login") + "?error=" + code);
	}

	private void redirect(HttpServletResponse response, String uri) throws IOException {
		response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
		response.setHeader("Referrer-Policy", "no-referrer");
		response.setStatus(HttpServletResponse.SC_FOUND);
		response.setHeader(HttpHeaders.LOCATION, uri);
	}
}
