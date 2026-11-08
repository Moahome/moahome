package com.moahome.server.user.controller;

import java.util.UUID;
import com.moahome.server.auth.domain.AuthSession;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.security.WebAuthSupport;
import com.moahome.server.auth.service.AuthService;
import com.moahome.server.auth.service.TokenService;
import com.moahome.server.user.dto.AccountRecoveryResponse;
import com.moahome.server.user.service.AccountLifecycleService;
import io.swagger.v3.oas.annotations.Operation;
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
@Tag(name = "계정 복구", description = "동일 카카오 계정의 재인증으로 발급한 10분 복구 전용 쿠키만 허용합니다.")
@SecurityRequirement(name = "webRefreshCookie")
public class AccountRecoveryController {
	private final AccountLifecycleService accounts;
	private final AuthService auth;
	private final WebAuthSupport web;

	public AccountRecoveryController(AccountLifecycleService accounts, AuthService auth, WebAuthSupport web) {
		this.accounts = accounts;
		this.auth = auth;
		this.web = web;
	}

	@GetMapping(WebAuthSupport.RECOVERY_PATH)
	@Operation(summary = "내 계정 복구 상태", description = "일반 로그인 세션·Bearer로 대체할 수 없습니다. 복구 신청용 csrfToken을 포함합니다.")
	public ResponseEntity<AccountRecoveryResponse> status(HttpServletRequest request) {
		AuthSession session = recoverySession(request);
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
		    .body(accounts.recovery(UUID.fromString(session.userId()), session.csrfToken()));
	}

	/** Origin·CSRF와 복구 전용 세션을 검증한 후 계정 복구와 새 일반 세션 발급을 구분합니다. */
	@PostMapping(WebAuthSupport.RECOVERY_PATH)
	@Operation(summary = "탈퇴 신청 취소와 계정 복구", description = "X-CSRF-TOKEN이 필요하며 30일 기한 이후에는 복구할 수 없습니다.")
	public ResponseEntity<Void> recover(HttpServletRequest request) {
		AuthSession session = recoverySession(request);
		accounts.recover(UUID.fromString(session.userId()));
		TokenService.TokenPair pair = auth.completeRecoverySession(session);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore())
		    .header(HttpHeaders.SET_COOKIE, web.refreshCookie(pair.refreshToken(), pair.refreshExpiresAt())).build();
	}

	private AuthSession recoverySession(HttpServletRequest request) {
		Object value = request.getAttribute(WebAuthSupport.SESSION_ATTRIBUTE);
		if (!(value instanceof AuthSession session) || !session.recoveryOnly()) {
			throw new AuthException(AuthErrorCode.ACCESS_DENIED);
		}
		return session;
	}
}
