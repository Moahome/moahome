package com.moahome.server.user.controller;

import java.util.UUID;

import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.security.AuthErrorHandler;
import com.moahome.server.user.dto.CurrentUserResponse;
import com.moahome.server.user.exception.UserException;
import com.moahome.server.user.service.UserService;

import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class UserController {
	private final UserService users;

	public UserController(UserService users) {
		this.users = users;
	}

	/** 요청 입력의 사용자 ID 대신 검증된 Bearer의 계정으로 본인 정보를 조회합니다. */
	@GetMapping("/api/users/me")
	public ResponseEntity<CurrentUserResponse> me(@AuthenticationPrincipal AuthPrincipal principal) {
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
