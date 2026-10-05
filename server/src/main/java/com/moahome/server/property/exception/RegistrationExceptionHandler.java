package com.moahome.server.property.exception;

import java.util.List;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.moahome.server.auth.exception.*;
import com.moahome.server.property.controller.PropertyRegistrationController;
import com.moahome.server.user.exception.UserException;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataAccessException;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.TransactionException;
import org.springframework.web.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice(assignableTypes = PropertyRegistrationController.class)
public class RegistrationExceptionHandler {
	@ExceptionHandler(RegistrationException.class)
	public ResponseEntity<ErrorResponse> registration(RegistrationException exception, HttpServletRequest request) {
		return error(exception.code().status(), exception.code().name(), message(exception.code(), request),
			isBasic(request) ? null : exception.errors());
	}

	/** Bean Validation 상세에는 필드 경로와 고정 문구만 포함하고 거부된 입력값은 제외합니다. */
	@ExceptionHandler(MethodArgumentNotValidException.class)
	public ResponseEntity<ErrorResponse> validation(MethodArgumentNotValidException exception, HttpServletRequest request) {
		var errors = exception.getBindingResult().getFieldErrors().stream()
			.map(field -> new RegistrationException.FieldError(field.getField().replace(".<list element>", ""),
				field.getDefaultMessage(), "입력 정보를 확인해주세요."))
			.sorted(java.util.Comparator.comparing(RegistrationException.FieldError::field)
				.thenComparing(RegistrationException.FieldError::reason)).distinct().toList();
		return error(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message(RegistrationErrorCode.INVALID_REQUEST, request),
			isBasic(request) ? null : errors);
	}

	@ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
		MissingServletRequestParameterException.class})
	public ResponseEntity<ErrorResponse> invalid(Exception exception, HttpServletRequest request) {
		return error(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message(RegistrationErrorCode.INVALID_REQUEST, request), null);
	}

	@ExceptionHandler(HttpMediaTypeNotSupportedException.class)
	public ResponseEntity<ErrorResponse> unsupported(Exception exception) {
		return registrationError(RegistrationErrorCode.UNSUPPORTED_MEDIA_TYPE);
	}

	@ExceptionHandler(AuthException.class)
	public ResponseEntity<ErrorResponse> auth(AuthException exception) {
		return error(exception.code().status(), exception.code().name(), exception.code().message(), null);
	}

	@ExceptionHandler(UserException.class)
	public ResponseEntity<ErrorResponse> user(UserException exception) {
		return error(AuthErrorCode.ACCOUNT_UNAVAILABLE.status(), "ACCOUNT_UNAVAILABLE",
			AuthErrorCode.ACCOUNT_UNAVAILABLE.message(), null);
	}

	@ExceptionHandler(AccessDeniedException.class)
	public ResponseEntity<ErrorResponse> denied(AccessDeniedException exception) {
		return error(HttpStatus.FORBIDDEN, "ACCESS_DENIED", AuthErrorCode.ACCESS_DENIED.message(), null);
	}

	/** 커밋 단계 장애도 같은 저장 오류로 매핑하며 SQL과 내부 예외를 응답에 노출하지 않습니다. */
	@ExceptionHandler({DataAccessException.class, TransactionException.class})
	public ResponseEntity<ErrorResponse> storage(Exception exception) {
		return registrationError(RegistrationErrorCode.REGISTRATION_SERVICE_UNAVAILABLE);
	}

	@ExceptionHandler(Exception.class)
	public ResponseEntity<ErrorResponse> unexpected(Exception exception) {
		return registrationError(RegistrationErrorCode.INTERNAL_SERVER_ERROR);
	}

	private ResponseEntity<ErrorResponse> registrationError(RegistrationErrorCode code) {
		return error(code.status(), code.name(), code.message(), null);
	}

	private boolean isBasic(HttpServletRequest request) {
		return request.getRequestURI().endsWith("/basic-info/validate");
	}

	private String message(RegistrationErrorCode code, HttpServletRequest request) {
		return code == RegistrationErrorCode.INVALID_REQUEST && isBasic(request)
			? "요청 형식이 올바르지 않습니다." : code.message();
	}

	private ResponseEntity<ErrorResponse> error(HttpStatus status, String code, String message,
		List<RegistrationException.FieldError> errors) {
		var builder = ResponseEntity.status(status).cacheControl(CacheControl.noStore());
		if (status == HttpStatus.UNAUTHORIZED) { builder.header("WWW-Authenticate", "Bearer"); }
		return builder.body(new ErrorResponse(code, message, errors));
	}

	@Schema(name = "RegistrationErrorResponse", description = "등록 오류. 입력 원문과 계좌번호는 포함하지 않습니다.")
	public record ErrorResponse(
		@Schema(example = "INVALID_REQUEST") String code,
		@Schema(example = "등록 정보를 확인해주세요.") String message,
		@Schema(description = "최종 등록의 필드 오류 상세. 기본 정보 검증과 상세가 없는 오류에는 생략", nullable = true)
		@JsonInclude(JsonInclude.Include.NON_NULL) List<RegistrationException.FieldError> errors) {
	}
}
