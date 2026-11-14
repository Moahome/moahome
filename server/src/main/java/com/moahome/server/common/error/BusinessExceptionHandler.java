package com.moahome.server.common.error;

import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.user.exception.UserException;

/** 동일한 예외 분류·응답 생성만 공유합니다. Advice의 적용 Controller와 업무별 안내는 하위 도메인이 정합니다. */
public abstract class BusinessExceptionHandler {

	private final String invalidMessage;

	private final String conflictCode;

	private final String conflictMessage;

	private final String unavailableCode;

	private final String unavailableMessage;

	protected BusinessExceptionHandler(String invalidMessage, String conflictCode, String conflictMessage,
	    String unavailableCode, String unavailableMessage) {
		this.invalidMessage = invalidMessage;
		this.conflictCode = conflictCode;
		this.conflictMessage = conflictMessage;
		this.unavailableCode = unavailableCode;
		this.unavailableMessage = unavailableMessage;
	}

	/** 호출한 업무가 다른 도메인 서비스를 사용해도 오류에 지정된 상태·코드·안내를 유지합니다. */
	@ExceptionHandler(BusinessException.class)
	public ResponseEntity<ErrorResponse> business(BusinessException exception) {
		return ErrorResponses.of(exception.status(), exception.code(), exception.publicMessage());
	}

	@ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class,
	        MethodArgumentTypeMismatchException.class, IllegalArgumentException.class,
	        MissingServletRequestPartException.class, MaxUploadSizeExceededException.class})
	public ResponseEntity<ErrorResponse> invalid(Exception exception) {
		return ErrorResponses.of(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", invalidMessage);
	}

	@ExceptionHandler(AuthException.class)
	public ResponseEntity<ErrorResponse> auth(AuthException exception) {
		return ErrorResponses.of(exception.code().status(), exception.code().name(), exception.code().message());
	}

	@ExceptionHandler(UserException.class)
	public ResponseEntity<ErrorResponse> account(UserException exception) {
		return ErrorResponses.of(HttpStatus.FORBIDDEN, "ACCOUNT_UNAVAILABLE", "계정을 사용할 수 없습니다.");
	}

	@ExceptionHandler(DataIntegrityViolationException.class)
	public ResponseEntity<ErrorResponse> duplicate(DataIntegrityViolationException exception) {
		return ErrorResponses.of(HttpStatus.CONFLICT, conflictCode, conflictMessage);
	}

	@ExceptionHandler(DataAccessException.class)
	public ResponseEntity<ErrorResponse> unavailable(DataAccessException exception) {
		return ErrorResponses.of(HttpStatus.SERVICE_UNAVAILABLE, unavailableCode, unavailableMessage);
	}

	@ExceptionHandler(Exception.class)
	public ResponseEntity<ErrorResponse> unexpected(Exception exception) {
		return ErrorResponses.of(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "요청을 처리하지 못했습니다.");
	}
}
