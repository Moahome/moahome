package com.moahome.server.auth.controller;

import java.time.Instant;

import com.moahome.server.auth.domain.AuthSession;
import com.moahome.server.auth.domain.ClientType;
import com.moahome.server.auth.security.WebAuthSupport;
import com.moahome.server.auth.service.AuthService;
import com.moahome.server.auth.service.TokenService;
import com.moahome.server.auth.security.AuthErrorHandler;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "웹 인증", description = "로그인 시 설정된 HttpOnly Refresh 쿠키를 브라우저가 자동 전송합니다. "
	+ "POST에는 허용된 Origin과 X-CSRF-TOKEN이 필요합니다. local Profile에서는 http://localhost:4000을 자동 허용합니다.")
@SecurityRequirement(name = "webRefreshCookie")
@ApiResponses({
	@ApiResponse(responseCode = "401", description = "쿠키 없음, 유효하지 않거나 만료된 토큰 / 세션, REFRESH_TOKEN_REUSED",
		content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorHandler.ErrorResponse.class))),
	@ApiResponse(responseCode = "403", description = "CSRF_INVALID / ACCOUNT_UNAVAILABLE / ACCESS_DENIED",
		content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorHandler.ErrorResponse.class))),
	@ApiResponse(responseCode = "503", description = "AUTH_SERVICE_UNAVAILABLE",
		content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorHandler.ErrorResponse.class)))
})
public class WebAuthController {
	private final AuthService auth;
	private final WebAuthSupport web;

	public WebAuthController(AuthService auth, WebAuthSupport web) {
		this.auth = auth;
		this.web = web;
	}

	@GetMapping(WebAuthSupport.CSRF_PATH)
	@Operation(summary = "웹 세션 CSRF 토큰 조회", description = "유효한 Refresh 쿠키로 세션의 CSRF 토큰을 조회합니다. Bearer 토큰으로 대체할 수 없습니다.")
	@ApiResponse(responseCode = "200", description = "현재 웹 세션의 CSRF 토큰",
		content = @Content(mediaType = "application/json", schema = @Schema(implementation = CsrfResponse.class)))
	public ResponseEntity<CsrfResponse> csrf(HttpServletRequest request) {
		AuthSession session = (AuthSession) request.getAttribute(WebAuthSupport.SESSION_ATTRIBUTE);
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new CsrfResponse(session.csrfToken()));
	}

	@PostMapping(WebAuthSupport.REFRESH_PATH)
	@Operation(summary = "웹 토큰 재발급", description = "Access Token을 JSON으로 반환하고 Refresh 쿠키를 교체합니다. "
		+ "교체된 이전 Refresh Token의 재사용은 해당 세션 전체를 무효화합니다. 최초 로그인 세션의 절대 만료는 연장하지 않습니다.",
		parameters = @Parameter(name = "X-CSRF-TOKEN", in = ParameterIn.HEADER, required = true,
			description = "GET /api/auth/web/csrf에서 받은 현재 세션의 csrfToken"))
	@ApiResponse(responseCode = "200", description = "Access Token JSON과 교체된 HttpOnly Refresh 쿠키",
		content = @Content(mediaType = "application/json", schema = @Schema(implementation = AccessTokenResponse.class)))
	public ResponseEntity<AccessTokenResponse> refresh(HttpServletRequest request) {
		TokenService.TokenPair pair = auth.refresh(web.refreshToken(request), ClientType.WEB);
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.header(HttpHeaders.SET_COOKIE, web.refreshCookie(pair.refreshToken(), pair.refreshExpiresAt()))
			.body(new AccessTokenResponse(pair.accessToken(), "Bearer", pair.accessExpiresAt()));
	}

	@PostMapping(WebAuthSupport.LOGOUT_PATH)
	@Operation(summary = "웹 현재 세션 로그아웃", description = "현재 웹 세션을 삭제하고 Refresh 쿠키를 만료시킵니다.",
		parameters = @Parameter(name = "X-CSRF-TOKEN", in = ParameterIn.HEADER, required = true,
			description = "GET /api/auth/web/csrf에서 받은 현재 세션의 csrfToken"))
	@ApiResponse(responseCode = "204", description = "현재 세션 로그아웃 성공과 Refresh 쿠키 삭제", content = @Content)
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
