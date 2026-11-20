package com.moahome.server.accounting.exception;

import com.moahome.server.common.error.ErrorResponses;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import com.moahome.server.accounting.controller.IncomeStatementController;
import com.moahome.server.accounting.controller.AccountLedgerController;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.common.error.ErrorResponse;
import com.moahome.server.user.exception.UserException;
import com.moahome.server.expense.controller.PayableController;
import com.moahome.server.accounting.controller.AccountingAccountController;

@RestControllerAdvice(assignableTypes = {IncomeStatementController.class, AccountLedgerController.class, PayableController.class, AccountingAccountController.class})
public class AccountingExceptionHandler {
	@ExceptionHandler(AccountingException.class)
	public ResponseEntity<ErrorResponse> accounting(AccountingException exception) {
		String code = exception.code();
		HttpStatus status = code.startsWith("INVALID_") ? HttpStatus.BAD_REQUEST : HttpStatus.CONFLICT;
		if (code.endsWith("NOT_FOUND"))
			status = HttpStatus.NOT_FOUND;
		String message = switch (code) {
			case "ACCOUNTING_ACCOUNT_PROTECTED" -> "기본 제공 과목의 보호된 항목은 변경할 수 없습니다.";
			case "ACCOUNTING_ACCOUNT_USED" -> "사용한 과목은 코드·유형·손익 분류를 변경하거나 삭제할 수 없습니다.";
			case "ACCOUNTING_ACCOUNT_CONFLICT" -> "다른 변경이 저장됐습니다. 최신 과목 정보를 다시 확인해주세요.";
			case "ACCOUNTING_CODE_CONFLICT" -> "같은 코드 또는 같은 분류의 과목명이 이미 있습니다.";
			case "ACCOUNTING_CODE_EXHAUSTED" -> "이 유형에 배정할 수 있는 코드가 없습니다.";
			case "ACCOUNTING_ACCOUNT_NOT_FOUND" -> "계정과목을 찾을 수 없습니다.";
			case "INVALID_ACCOUNTING_ACCOUNT" -> "사용 가능한 과목과 유형에 맞는 코드를 확인해주세요.";
			case "INVALID_PAYABLE_REQUEST", "INVALID_PAYABLE_AMOUNT" -> "발생일과 1원 이상의 미지급 금액을 확인해주세요.";
			case "INVALID_PAYABLE_PAYMENT" -> "같은 비용 과목·동의 확정 출금을 선택해주세요. 이미 연결했거나 발생일 이전의 출금은 사용할 수 없습니다.";
			case "PAYABLE_PAYMENT_EXCEEDS_REMAINING" -> "출금액이 남은 미지급 금액을 초과합니다.";
			case "PAYABLE_HAS_PAYMENTS" -> "지급 연결을 먼저 해제한 뒤 등록을 취소해주세요.";
			case "PAYABLE_CANCELED" -> "취소된 미지급금에는 지급을 연결할 수 없습니다.";
			case "PAYABLE_REQUEST_CONFLICT" -> "같은 요청의 등록 내용이 다릅니다. 최신 내역을 확인해주세요.";
			case "PAYABLE_NOT_FOUND" -> "미지급 내역을 찾을 수 없습니다.";
			case "ACCOUNTING_SETUP_REQUIRED" -> "회계 시작 기준을 먼저 설정해주세요.";
			case "ACCOUNTING_BILLING_REQUIRED" -> "첫 관리비 부과 이후 자동 연결됩니다.";
			case "INVALID_ACCOUNTING_TRANSFER" -> "같은 날짜·금액과 동별 배분의 다른 통장 입금을 선택해주세요.";
			case "ACCOUNTING_SETTINGS_CONFLICT" -> "저장한 회계 시작 기준은 덮어쓸 수 없습니다.";
			case "ACCOUNTING_REVIEW_CONFLICT" -> "다른 확인 내역이 저장됐습니다. 최신 자료를 다시 확인해주세요.";
			case "ACCOUNTING_SOURCE_NOT_FOUND" -> "현재 유효한 지출을 찾을 수 없습니다.";
			default -> "회계 조회 조건과 확인 내용을 다시 확인해주세요.";
		};
		return error(status, code, message);
	}

	@ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class,
		MethodArgumentTypeMismatchException.class, IllegalArgumentException.class})
	public ResponseEntity<ErrorResponse> invalid(Exception exception) {
		return error(HttpStatus.BAD_REQUEST, "INVALID_ACCOUNTING_REQUEST", "회계 입력 내용을 확인해주세요.");
	}

	@ExceptionHandler(AuthException.class)
	public ResponseEntity<ErrorResponse> auth(AuthException exception) {
		return error(exception.code().status(), exception.code().name(), exception.code().message());
	}

	@ExceptionHandler(UserException.class)
	public ResponseEntity<ErrorResponse> user(UserException exception) {
		return error(HttpStatus.FORBIDDEN, "ACCOUNT_UNAVAILABLE", "계정을 사용할 수 없습니다.");
	}

	@ExceptionHandler(DataIntegrityViolationException.class)
	public ResponseEntity<ErrorResponse> conflict(DataIntegrityViolationException exception) {
		return error(HttpStatus.CONFLICT, "ACCOUNTING_REVIEW_CONFLICT", "최신 회계 자료를 다시 확인해주세요.");
	}

	@ExceptionHandler(DataAccessException.class)
	public ResponseEntity<ErrorResponse> unavailable(DataAccessException exception) {
		return error(HttpStatus.SERVICE_UNAVAILABLE, "ACCOUNTING_SERVICE_UNAVAILABLE", "회계 자료를 불러오지 못했습니다.");
	}

	/** SQL·원문·내부 예외는 반환하지 않고 실패를 0원 자료로 바꾸지 않습니다. */
	@ExceptionHandler(Exception.class)
	public ResponseEntity<ErrorResponse> unexpected(Exception exception) {
		return error(HttpStatus.INTERNAL_SERVER_ERROR, "ACCOUNTING_REQUEST_FAILED", "회계 자료를 처리하지 못했습니다.");
	}

	private ResponseEntity<ErrorResponse> error(HttpStatus status, String code, String message) {
		return ErrorResponses.of(status, code, message);
	}
}
