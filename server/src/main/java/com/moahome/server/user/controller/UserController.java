package com.moahome.server.user.controller;

import java.util.UUID;

import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.security.AuthErrorHandler;
import com.moahome.server.user.dto.CurrentUserResponse;
import com.moahome.server.user.exception.UserException;
import com.moahome.server.user.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "사용자", description = "로그인 계정 정보")
@SecurityRequirement(name = "bearerAuth")
public class UserController {
	private final UserService users;

	public UserController(UserService users) {
		this.users = users;
	}

	/** 요청 입력의 사용자 ID 대신 검증된 Bearer의 계정으로 본인 정보를 조회합니다. */
	@GetMapping("/api/users/me")
	@Operation(summary = "내 정보 조회", description = "검증된 Access Token의 정상 계정을 조회합니다. systemRole은 플랫폼 역할이며 관리대상별 역할과 구분합니다.")
	@ApiResponses({
	        @ApiResponse(responseCode = "200", description = "로그인 계정 정보", content = @Content(mediaType = "application/json", schema = @Schema(implementation = CurrentUserResponse.class))),
	        @ApiResponse(responseCode = "401", description = "인증 없음, 유효하지 않거나 만료된 토큰 / 세션", content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorHandler.ErrorResponse.class))),
	        @ApiResponse(responseCode = "403", description = "ACCOUNT_UNAVAILABLE / ACCESS_DENIED", content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorHandler.ErrorResponse.class))),
	        @ApiResponse(responseCode = "503", description = "AUTH_SERVICE_UNAVAILABLE", content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorHandler.ErrorResponse.class))) })
	public ResponseEntity<CurrentUserResponse> me(
	    @Parameter(hidden = true) @AuthenticationPrincipal AuthPrincipal principal) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
		    .body(users.getCurrentUser(UUID.fromString(principal.userId())));
	}

	/** 인증 필터 통과 후 계정이 정지·탈퇴되더라도 이용 불가 응답으로 차단합니다. */
	@ExceptionHandler(UserException.class)
	public ResponseEntity<AuthErrorHandler.ErrorResponse> handleUnavailableAccount(UserException exception) {
		return error(AuthErrorCode.ACCOUNT_UNAVAILABLE);
	}

	/** 조회 장애를 로그인 만료와 구분하고 내부 저장소 오류를 응답에 노출하지 않습니다. */
	@ExceptionHandler(DataAccessException.class)
	public ResponseEntity<AuthErrorHandler.ErrorResponse> handleUnavailableStorage(DataAccessException exception) {
		return error(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE);
	}

	private ResponseEntity<AuthErrorHandler.ErrorResponse> error(AuthErrorCode code) {
		return ResponseEntity.status(code.status()).cacheControl(CacheControl.noStore())
		    .body(new AuthErrorHandler.ErrorResponse(code.name(), code.message()));
	}
}
