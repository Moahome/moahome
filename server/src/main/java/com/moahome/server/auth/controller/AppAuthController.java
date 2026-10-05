package com.moahome.server.auth.controller;

import java.time.Instant;

import com.moahome.server.auth.domain.ClientType;
import com.moahome.server.auth.service.AuthService;
import com.moahome.server.auth.service.TokenService;
import com.moahome.server.auth.security.AuthErrorHandler;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "앱 인증", description = "JSON의 앱 Refresh Token으로 재발급 / 로그아웃하며 웹 쿠키를 사용하지 않습니다.")
@ApiResponses({
	@ApiResponse(responseCode = "400", description = "INVALID_REQUEST: 잘못된 Refresh Token 요청",
		content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorHandler.ErrorResponse.class))),
	@ApiResponse(responseCode = "401", description = "유효하지 않거나 만료된 토큰 / 세션, REFRESH_TOKEN_REUSED",
		content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorHandler.ErrorResponse.class))),
	@ApiResponse(responseCode = "403", description = "ACCOUNT_UNAVAILABLE / ACCESS_DENIED",
		content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorHandler.ErrorResponse.class))),
	@ApiResponse(responseCode = "503", description = "AUTH_SERVICE_UNAVAILABLE",
		content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorHandler.ErrorResponse.class)))
})
public class AppAuthController {
	public static final String REFRESH_PATH = "/api/auth/app/refresh";
	public static final String LOGOUT_PATH = "/api/auth/app/logout";
	private final AuthService auth;

	public AppAuthController(AuthService auth) {
		this.auth = auth;
	}

	@PostMapping(REFRESH_PATH)
	@Operation(summary = "앱 토큰 재발급", description = "앱 Refresh Token을 교체하고 두 토큰을 반환합니다. "
		+ "교체된 이전 Refresh Token을 재사용하면 해당 세션 전체를 무효화합니다.")
	@ApiResponse(responseCode = "200", description = "교체된 Access / Refresh Token과 만료시각",
		content = @Content(mediaType = "application/json", schema = @Schema(implementation = AppTokenResponse.class)))
	public ResponseEntity<AppTokenResponse> refresh(
		@io.swagger.v3.oas.annotations.parameters.RequestBody(required = true,
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = RefreshTokenRequest.class)))
		@Valid @RequestBody RefreshTokenRequest request) {
		TokenService.TokenPair pair = auth.refresh(request.refreshToken(), ClientType.APP);
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new AppTokenResponse(
			pair.accessToken(), pair.refreshToken(), "Bearer", pair.accessExpiresAt(), pair.refreshExpiresAt()));
	}

	@PostMapping(LOGOUT_PATH)
	@Operation(summary = "앱 현재 세션 로그아웃", description = "Refresh Token으로 확인한 현재 앱 세션만 삭제합니다.")
	@ApiResponse(responseCode = "204", description = "현재 세션 로그아웃 성공", content = @Content)
	public ResponseEntity<Void> logout(
		@io.swagger.v3.oas.annotations.parameters.RequestBody(required = true,
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = RefreshTokenRequest.class)))
		@Valid @RequestBody RefreshTokenRequest request) {
		auth.logout(request.refreshToken(), ClientType.APP);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}

	public record RefreshTokenRequest(
		@Schema(description = "앱 로그인 세션의 현재 Refresh Token", example = "APP_REFRESH_TOKEN")
		@NotBlank @Size(max = 4096) String refreshToken) {
		@Override
		public String toString() {
			return "RefreshTokenRequest[REDACTED]";
		}
	}

	public record AppTokenResponse(String accessToken, String refreshToken, String tokenType,
		Instant accessExpiresAt, Instant refreshExpiresAt) {
		@Override
		public String toString() {
			return "AppTokenResponse[REDACTED]";
		}
	}
}
