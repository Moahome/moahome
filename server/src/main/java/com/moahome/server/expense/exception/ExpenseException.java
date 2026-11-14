package com.moahome.server.expense.exception;

import org.springframework.http.HttpStatus;
import com.moahome.server.common.error.BusinessException;

/** 지출 업무의 공개 오류 코드·상태·안내를 관리합니다. 기존 코드와 상태 분류를 유지합니다. */
public class ExpenseException extends BusinessException {

	public ExpenseException(String code) {
		super(status(code), code, message(code));
	}

	private static HttpStatus status(String code) {
		if (code.startsWith("INVALID_")) {
			return HttpStatus.BAD_REQUEST;
		}
		if (code.endsWith("NOT_FOUND")) {
			return HttpStatus.NOT_FOUND;
		}
		return HttpStatus.CONFLICT;
	}

	private static String message(String code) {
		return "지출 정보를 확인해주세요.";
	}
}
