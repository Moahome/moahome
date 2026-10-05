package com.moahome.server.property.exception;

import org.springframework.http.HttpStatus;

public enum RegistrationErrorCode {
	INVALID_REQUEST(HttpStatus.BAD_REQUEST, "등록 정보를 확인해주세요."),
	REGISTRATION_NOT_FOUND(HttpStatus.NOT_FOUND, "등록 결과를 찾을 수 없습니다."),
	REGISTRATION_REQUEST_CONFLICT(HttpStatus.CONFLICT, "이미 사용한 등록 요청입니다."),
	REGISTRATION_IN_PROGRESS(HttpStatus.CONFLICT, "등록을 처리하고 있습니다."),
	REGISTRATION_SERVICE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "등록 서비스를 일시적으로 사용할 수 없습니다."),
	UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "JSON 형식으로 요청해주세요."),
	INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "요청을 처리하지 못했습니다.");

	private final HttpStatus status;
	private final String message;

	RegistrationErrorCode(HttpStatus status, String message) {
		this.status = status;
		this.message = message;
	}

	public HttpStatus status() { return status; }
	public String message() { return message; }
}
