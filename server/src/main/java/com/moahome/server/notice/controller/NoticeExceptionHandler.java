package com.moahome.server.notice.controller;

import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.security.AuthErrorHandler.ErrorResponse;
import com.moahome.server.user.exception.UserException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice(assignableTypes = NoticeController.class)
public class NoticeExceptionHandler {

	/** 입력 원문·SQL·본문을 노출하지 않고 상태에 대응하는 오류 코드만 전달합니다. */
	@ExceptionHandler(ResponseStatusException.class)
	public ResponseEntity<ErrorResponse> notice(ResponseStatusException exception) {
		int status = exception.getStatusCode().value();
		String code = switch (status) {
			case 403 -> "NOTICE_EDIT_FORBIDDEN";
			case 404 -> "NOTICE_NOT_FOUND";
			case 409 -> "NOTICE_CONFLICT";
			case 503 -> "NOTICE_STORAGE_UNAVAILABLE";
			default -> "INVALID_NOTICE_REQUEST";
		};
		return error(status, code, "공지사항을 처리하지 못했습니다.");
	}

	@ExceptionHandler(AuthException.class)
	public ResponseEntity<ErrorResponse> auth(AuthException exception) {
		return error(exception.code().status().value(), exception.code().name(), exception.code().message());
	}

	@ExceptionHandler(UserException.class)
	public ResponseEntity<ErrorResponse> account(UserException exception) {
		return error(403, "ACCOUNT_UNAVAILABLE", "계정을 사용할 수 없습니다.");
	}

	@ExceptionHandler({ MethodArgumentNotValidException.class, HttpMessageNotReadableException.class,
		MethodArgumentTypeMismatchException.class })
	public ResponseEntity<ErrorResponse> invalid(Exception exception) {
		return error(400, "INVALID_NOTICE_REQUEST", "공지 입력 정보를 확인해주세요.");
	}

	@ExceptionHandler({ DataAccessException.class, TransactionException.class })
	public ResponseEntity<ErrorResponse> storage(Exception exception) {
		return error(503, "NOTICE_SERVICE_UNAVAILABLE", "공지를 일시적으로 처리하지 못했습니다.");
	}

	private ResponseEntity<ErrorResponse> error(int status, String code, String message) {
		return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(new ErrorResponse(code, message));
	}
}
