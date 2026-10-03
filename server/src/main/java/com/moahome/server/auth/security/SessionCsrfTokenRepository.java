package com.moahome.server.auth.security;

import com.moahome.server.auth.domain.AuthSession;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.DefaultCsrfToken;

public class SessionCsrfTokenRepository implements CsrfTokenRepository {
	@Override
	public CsrfToken generateToken(HttpServletRequest request) {
		throw new AuthException(AuthErrorCode.AUTHENTICATION_REQUIRED);
	}

	@Override
	public void saveToken(CsrfToken token, HttpServletRequest request, HttpServletResponse response) {
		// The token is created with the Redis login session and removed with that session.
	}

	@Override
	public CsrfToken loadToken(HttpServletRequest request) {
		AuthSession session = (AuthSession) request.getAttribute(WebAuthSupport.SESSION_ATTRIBUTE);
		if (session == null) {
			return null;
		}
		return new DefaultCsrfToken("X-CSRF-TOKEN", "_csrf", session.csrfToken());
	}
}
