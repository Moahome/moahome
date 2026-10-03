package com.moahome.server.auth.controller;

import java.time.Instant;

import com.moahome.server.auth.domain.ClientType;
import com.moahome.server.auth.service.AuthService;
import com.moahome.server.auth.service.TokenService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AppAuthController {
	public static final String REFRESH_PATH = "/api/auth/app/refresh";
	public static final String LOGOUT_PATH = "/api/auth/app/logout";
	private final AuthService auth;

	public AppAuthController(AuthService auth) {
		this.auth = auth;
	}

	@PostMapping(REFRESH_PATH)
	public ResponseEntity<AppTokenResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
		TokenService.TokenPair pair = auth.refresh(request.refreshToken(), ClientType.APP);
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new AppTokenResponse(
			pair.accessToken(), pair.refreshToken(), "Bearer", pair.accessExpiresAt(), pair.refreshExpiresAt()));
	}

	@PostMapping(LOGOUT_PATH)
	public ResponseEntity<Void> logout(@Valid @RequestBody RefreshTokenRequest request) {
		auth.logout(request.refreshToken(), ClientType.APP);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}

	public record RefreshTokenRequest(@NotBlank @Size(max = 4096) String refreshToken) {
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
