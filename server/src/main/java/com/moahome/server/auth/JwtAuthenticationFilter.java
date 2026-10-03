package com.moahome.server.auth;

import java.io.IOException;
import java.util.List;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.web.filter.OncePerRequestFilter;

public class JwtAuthenticationFilter extends OncePerRequestFilter {
	private final DefaultBearerTokenResolver bearerTokens = new DefaultBearerTokenResolver();
	private final AuthService auth;
	private final WebAuthSupport web;
	private final AuthErrorHandler errors;

	public JwtAuthenticationFilter(AuthService auth, WebAuthSupport web, AuthErrorHandler errors) {
		this.auth = auth;
		this.web = web;
		this.errors = errors;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
		throws ServletException, IOException {
		try {
			AuthPrincipal principal = resolvePrincipal(request);
			if (principal != null) {
				SecurityContext context = SecurityContextHolder.createEmptyContext();
				context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(principal, null, List.of()));
				SecurityContextHolder.setContext(context);
			}
		} catch (AuthException exception) {
			SecurityContextHolder.clearContext();
			errors.write(response, exception.code());
			return;
		} catch (OAuth2AuthenticationException exception) {
			errors.write(response, AuthErrorCode.INVALID_TOKEN);
			return;
		}
		chain.doFilter(request, response);
	}

	private AuthPrincipal resolvePrincipal(HttpServletRequest request) {
		if (WebAuthSupport.isWebAuthRequest(request)) {
			web.verifyOrigin(request);
			AuthSession session = auth.authenticateRefresh(web.refreshToken(request), ClientType.WEB);
			request.setAttribute(WebAuthSupport.SESSION_ATTRIBUTE, session);
			return new AuthPrincipal(session.userId(), session.sessionId());
		}
		String path = request.getRequestURI().substring(request.getContextPath().length());
		if ("POST".equals(request.getMethod())
			&& (AppAuthController.REFRESH_PATH.equals(path) || AppAuthController.LOGOUT_PATH.equals(path))) {
			return null;
		}
		String token = bearerTokens.resolve(request);
		return token == null ? null : auth.authenticateAccess(token);
	}
}
