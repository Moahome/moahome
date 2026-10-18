package com.moahome.server.payment.exception;

import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.security.AuthErrorHandler.ErrorResponse;
import com.moahome.server.payment.controller.PaymentController;
import com.moahome.server.user.exception.UserException;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice(assignableTypes = {PaymentController.class, com.moahome.server.banking.controller.BankingController.class, com.moahome.server.banking.controller.BankingBalanceController.class, com.moahome.server.banking.controller.BankAccountController.class, com.moahome.server.billing.controller.OpeningBalanceController.class,
    com.moahome.server.membership.controller.MemberManagementController.class, com.moahome.server.membership.controller.InvitationClaimController.class,
    com.moahome.server.membership.controller.MembershipRequestController.class})
public class PaymentExceptionHandler {
	@ExceptionHandler(PaymentException.class)
	public ResponseEntity<ErrorResponse> billing(PaymentException exception) {
		var code = exception.code();
		HttpStatus status=HttpStatus.CONFLICT;
        if (code.startsWith("INVALID_")||code.equals("BANK_ROW_LIMIT")||code.equals("EMPTY_BANK_FILE")) status=HttpStatus.BAD_REQUEST;
        if (code.endsWith("NOT_FOUND")) status=HttpStatus.NOT_FOUND;
        return error(status,code,"입금 정보를 확인해주세요.");
	}

	/** 입력 원문과 검증기의 내부 문구 대신 고정된 오류만 반환합니다. */
	@ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class,
		MethodArgumentTypeMismatchException.class, IllegalArgumentException.class,
        org.springframework.web.multipart.support.MissingServletRequestPartException.class,
        org.springframework.web.multipart.MaxUploadSizeExceededException.class})
	public ResponseEntity<ErrorResponse> invalid(Exception exception) {
		return error(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "입금 정보를 확인해주세요.");
	}

	@ExceptionHandler(AuthException.class)
	public ResponseEntity<ErrorResponse> auth(AuthException exception) {
		return error(exception.code().status(), exception.code().name(), exception.code().message());
	}

	@ExceptionHandler(UserException.class)
	public ResponseEntity<ErrorResponse> account(UserException exception) {
		return error(HttpStatus.FORBIDDEN, "ACCOUNT_UNAVAILABLE", "계정을 사용할 수 없습니다.");
	}

	/** DB 유일성 충돌도 동일한 중복 안내로 반환하고 SQL·제약 이름은 노출하지 않습니다. */
	@ExceptionHandler(DataIntegrityViolationException.class)
	public ResponseEntity<ErrorResponse> duplicate(DataIntegrityViolationException exception) {
		return error(HttpStatus.CONFLICT, "PAYMENT_CONFLICT", "입금 정보가 변경되었습니다. 다시 확인해주세요.");
	}

	@ExceptionHandler(DataAccessException.class)
	public ResponseEntity<ErrorResponse> unavailable(DataAccessException exception) {
		return error(HttpStatus.SERVICE_UNAVAILABLE, "PAYMENT_SERVICE_UNAVAILABLE", "입금 정보를 처리하지 못했습니다.");
	}

	@ExceptionHandler(Exception.class)
	public ResponseEntity<ErrorResponse> unexpected(Exception exception) {
		return error(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "요청을 처리하지 못했습니다.");
	}

	private ResponseEntity<ErrorResponse> error(HttpStatus status, String code, String message) {
		return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(new ErrorResponse(code, message));
	}
}
