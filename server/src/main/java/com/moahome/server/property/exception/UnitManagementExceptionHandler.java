package com.moahome.server.property.exception;

import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.security.AuthErrorHandler.ErrorResponse;
import com.moahome.server.property.controller.UnitManagementController;
import com.moahome.server.user.exception.UserException;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice(assignableTypes = UnitManagementController.class)
public class UnitManagementExceptionHandler {
	@ExceptionHandler(UnitManagementException.class)
	public ResponseEntity<ErrorResponse> unit(UnitManagementException exception) {
		var code = exception.code();
		return error(code.status, code.name(), code.message);
	}

	/** 입력 원문과 검증기의 내부 문구 대신 고정된 오류만 반환합니다. */
	@ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class,
		MethodArgumentTypeMismatchException.class, IllegalArgumentException.class})
	public ResponseEntity<ErrorResponse> invalid(Exception exception) {
		return error(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "세대 정보를 확인해주세요.");
	}

	@ExceptionHandler(AuthException.class)
	public ResponseEntity<ErrorResponse> auth(AuthException exception) {
		return error(exception.code().status(), exception.code().name(), exception.code().message());
	}

    /** 당월 청구 생성에 필요한 설정 오류도 세대 추가 실패로 돌려주며 트랜잭션은 전체 롤백합니다. */
    @ExceptionHandler(com.moahome.server.billing.exception.BillingException.class)
    public ResponseEntity<ErrorResponse> billing(com.moahome.server.billing.exception.BillingException exception) {
        var code = exception.code();
        return error(code.status, code.name(), code.message);
    }

	@ExceptionHandler(UserException.class)
	public ResponseEntity<ErrorResponse> account(UserException exception) {
		return error(HttpStatus.FORBIDDEN, "ACCOUNT_UNAVAILABLE", "계정을 사용할 수 없습니다.");
	}

	/** DB 유일성 충돌도 동일한 중복 안내로 반환하고 SQL·제약 이름은 노출하지 않습니다. */
	@ExceptionHandler(DataIntegrityViolationException.class)
	public ResponseEntity<ErrorResponse> duplicate(DataIntegrityViolationException exception) {
		return error(HttpStatus.CONFLICT, "DUPLICATE_UNIT", "이미 등록된 호수입니다.");
	}

	@ExceptionHandler(DataAccessException.class)
	public ResponseEntity<ErrorResponse> unavailable(DataAccessException exception) {
		return error(HttpStatus.SERVICE_UNAVAILABLE, "UNIT_SERVICE_UNAVAILABLE", "세대 정보를 처리하지 못했습니다.");
	}

	@ExceptionHandler(Exception.class)
	public ResponseEntity<ErrorResponse> unexpected(Exception exception) {
		return error(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "요청을 처리하지 못했습니다.");
	}

	private ResponseEntity<ErrorResponse> error(HttpStatus status, String code, String message) {
		return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(new ErrorResponse(code, message));
	}
}
