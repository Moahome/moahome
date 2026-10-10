package com.moahome.server.property.exception;

import org.springframework.http.HttpStatus;

public class UnitManagementException extends RuntimeException {
	public enum Code {
		INVALID_REQUEST(HttpStatus.BAD_REQUEST, "세대 정보를 확인해주세요."),
		UNIT_NOT_FOUND(HttpStatus.NOT_FOUND, "세대를 찾을 수 없습니다."),
		DUPLICATE_UNIT(HttpStatus.CONFLICT, "이미 등록된 호수입니다."),
		DUPLICATE_BUILDING(HttpStatus.CONFLICT, "이미 등록된 동 이름입니다."),
		UNIT_NOT_EDITABLE(HttpStatus.CONFLICT, "수정할 수 없는 세대입니다.");

		public final HttpStatus status;
		public final String message;
		Code(HttpStatus status, String message) {
			this.status = status;
			this.message = message;
		}
	}

	private final Code code;
	public UnitManagementException(Code code) {
		super(code.message);
		this.code = code;
	}
	public Code code() { return code; }
}
