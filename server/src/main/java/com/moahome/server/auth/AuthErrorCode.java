package com.moahome.server.auth;

import org.springframework.http.HttpStatus;

public enum AuthErrorCode {
	AUTHENTICATION_REQUIRED(HttpStatus.UNAUTHORIZED, "인증이 필요합니다."),
	INVALID_TOKEN(HttpStatus.UNAUTHORIZED, "유효하지 않은 인증 정보입니다."),
	ACCESS_TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED, "Access Token이 만료되었습니다."),
	REFRESH_TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED, "다시 로그인해야 합니다."),
	SESSION_EXPIRED(HttpStatus.UNAUTHORIZED, "로그인 세션이 만료되었습니다."),
	REFRESH_TOKEN_REUSED(HttpStatus.UNAUTHORIZED, "인증 정보가 재사용되어 다시 로그인해야 합니다."),
	ACCESS_DENIED(HttpStatus.FORBIDDEN, "접근 권한이 없습니다."),
	CSRF_INVALID(HttpStatus.FORBIDDEN, "요청 보안 검증에 실패했습니다."),
	INVALID_REQUEST(HttpStatus.BAD_REQUEST, "요청 형식이 올바르지 않습니다."),
	AUTH_SERVICE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "인증 서비스를 일시적으로 사용할 수 없습니다.");

	private final HttpStatus status;
	private final String message;

	AuthErrorCode(HttpStatus status, String message) {
		this.status = status;
		this.message = message;
	}

	public HttpStatus status() {
		return status;
	}

	public String message() {
		return message;
	}
}
