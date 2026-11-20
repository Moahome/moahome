package com.moahome.server.systemadmin.exception;

import com.moahome.server.common.error.ErrorResponses;
import com.moahome.server.common.error.ErrorResponse;
import jakarta.validation.ConstraintViolationException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.systemadmin.controller.SystemAdminController;
import com.moahome.server.user.exception.UserException;

@RestControllerAdvice(assignableTypes = SystemAdminController.class)
public class SystemAdminExceptionHandler {
	@ExceptionHandler(SystemAdminException.class)
	public ResponseEntity<ErrorResponse> business(SystemAdminException exception) {
		return error(exception.status(), exception.code(), exception.getMessage());
	}

	@ExceptionHandler(AuthException.class)
	public ResponseEntity<ErrorResponse> auth(AuthException exception) {
		return error(exception.code().status(), exception.code().name(), exception.code().message());
	}

	@ExceptionHandler(UserException.class)
	public ResponseEntity<ErrorResponse> unavailable(UserException exception) {
		return error(HttpStatus.FORBIDDEN, "ACCOUNT_UNAVAILABLE", "이용할 수 없는 계정입니다.");
	}

	@ExceptionHandler({ MethodArgumentNotValidException.class, ConstraintViolationException.class,
	        HandlerMethodValidationException.class, HttpMessageNotReadableException.class,
	        MethodArgumentTypeMismatchException.class })
	public ResponseEntity<ErrorResponse> invalid(Exception exception) {
		return error(HttpStatus.BAD_REQUEST, "INVALID_ADMIN_REQUEST", "입력 정보를 확인해주세요.");
	}

	/** DB·잠금 장애의 SQL이나 회원 정보를 노출하지 않으며 성공 응답으로 대체하지 않습니다. */
	@ExceptionHandler({ DataAccessException.class, TransactionException.class })
	public ResponseEntity<ErrorResponse> storage(Exception exception) {
		return error(HttpStatus.SERVICE_UNAVAILABLE, "ADMIN_SERVICE_UNAVAILABLE", "시스템 관리를 일시적으로 사용할 수 없습니다.");
	}

	private ResponseEntity<ErrorResponse> error(HttpStatus status, String code, String message) {
		return ErrorResponses.of(status, code, message);
	}
}
