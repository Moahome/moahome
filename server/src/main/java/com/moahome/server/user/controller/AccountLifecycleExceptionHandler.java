package com.moahome.server.user.controller;

import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.security.AuthErrorHandler;
import com.moahome.server.user.exception.AccountLifecycleException;
import com.moahome.server.user.exception.UserException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = { AccountWithdrawalController.class, AccountRecoveryController.class })
public class AccountLifecycleExceptionHandler {
	/** 내부 계정·SQL·토큰 원문 대신 확정한 실패 코드만 공개합니다. */
	@ExceptionHandler(AccountLifecycleException.class)
	public ResponseEntity<AuthErrorHandler.ErrorResponse> conflict(AccountLifecycleException exception) {
		String message = "ACCOUNT_HANDOVER_REQUIRED".equals(exception.code())
		    ? "관리소장을 인계한 뒤 탈퇴해주세요." : "참여 정보가 변경됐어요. 다시 확인해주세요.";
		return response(HttpStatus.CONFLICT, exception.code(), message);
	}

	@ExceptionHandler(AuthException.class)
	public ResponseEntity<AuthErrorHandler.ErrorResponse> authentication(AuthException exception) {
		return authError(exception.code());
	}

	@ExceptionHandler(UserException.class)
	public ResponseEntity<AuthErrorHandler.ErrorResponse> unavailable(UserException exception) {
		return authError(AuthErrorCode.ACCOUNT_UNAVAILABLE);
	}

	@ExceptionHandler(DataAccessException.class)
	public ResponseEntity<AuthErrorHandler.ErrorResponse> storage(DataAccessException exception) {
		return authError(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE);
	}

	@ExceptionHandler({ MethodArgumentNotValidException.class, HttpMessageNotReadableException.class })
	public ResponseEntity<AuthErrorHandler.ErrorResponse> invalid(Exception exception) {
		return authError(AuthErrorCode.INVALID_REQUEST);
	}

	private ResponseEntity<AuthErrorHandler.ErrorResponse> authError(AuthErrorCode code) {
		return response(code.status(), code.name(), code.message());
	}

	private ResponseEntity<AuthErrorHandler.ErrorResponse> response(HttpStatus status, String code, String message) {
		return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
		    .body(new AuthErrorHandler.ErrorResponse(code, message));
	}
}
