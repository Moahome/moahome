package com.moahome.server.resident.exception;

import org.springframework.http.HttpStatus;

public class ResidentRegistrationException extends RuntimeException {
	public enum Code {
		INVALID_UNIT(HttpStatus.BAD_REQUEST, "등록할 세대를 다시 선택해주세요."),
		DUPLICATE_RESIDENT(HttpStatus.CONFLICT, "이름과 연락처가 같은 주민이 이미 있습니다. 기존 주민을 확인해주세요."),
		RESIDENT_RESTORE_REQUIRED(HttpStatus.CONFLICT, "삭제된 명부에 이름과 연락처가 같은 주민이 있습니다. 기존 주민을 확인해주세요."),
		REGISTRATION_CONFLICT(HttpStatus.CONFLICT, "이미 사용된 등록 요청입니다. 주민 목록에서 등록 결과를 확인해주세요."),
		PHONE_SECURITY_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "연락처를 안전하게 저장할 수 없습니다. 관리자에게 문의해주세요.");
		public final HttpStatus status;
		public final String message;
		Code(HttpStatus status, String message) { this.status = status; this.message = message; }
	}
	private final Code code;
	public ResidentRegistrationException(Code code) { super(code.name()); this.code = code; }
	public Code code() { return code; }
}
