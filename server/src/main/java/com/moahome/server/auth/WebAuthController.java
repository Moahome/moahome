package com.moahome.server.auth;

import java.time.Instant;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class WebAuthController {
	private final AuthService auth;
	private final WebAuthSupport web;

	public WebAuthController(AuthService auth, WebAuthSupport web) {
		this.auth = auth;
		this.web = web;
	}

	@GetMapping(WebAuthSupport.CSRF_PATH)
	public ResponseEntity<CsrfResponse> csrf(HttpServletRequest request) {
		AuthSession session = (AuthSession) request.getAttribute(WebAuthSupport.SESSION_ATTRIBUTE);
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new CsrfResponse(session.csrfToken()));
	}

	@PostMapping(WebAuthSupport.REFRESH_PATH)
	public ResponseEntity<AccessTokenResponse> refresh(HttpServletRequest request) {
		TokenService.TokenPair pair = auth.refresh(web.refreshToken(request), ClientType.WEB);
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.header(HttpHeaders.SET_COOKIE, web.refreshCookie(pair.refreshToken(), pair.refreshExpiresAt()))
			.body(new AccessTokenResponse(pair.accessToken(), "Bearer", pair.accessExpiresAt()));
	}

	@PostMapping(WebAuthSupport.LOGOUT_PATH)
	public ResponseEntity<Void> logout(HttpServletRequest request) {
		auth.logout(web.refreshToken(request), ClientType.WEB);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore())
			.header(HttpHeaders.SET_COOKIE, web.clearCookie()).build();
	}

	public record CsrfResponse(String csrfToken) {
	}

	public record AccessTokenResponse(String accessToken, String tokenType, Instant accessExpiresAt) {
		@Override
		public String toString() {
			return "AccessTokenResponse[REDACTED]";
		}
	}
}
