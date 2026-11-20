package com.moahome.server.common.error;

import org.springframework.http.HttpStatus;

/** 도메인이 정한 공개용 오류만 전달합니다. 입력 원문·SQL·내부 예외 메시지를 응답에 사용하지 않습니다. */
public abstract class BusinessException extends RuntimeException {

	private final HttpStatus status;

	private final String code;

	private final String publicMessage;

	protected BusinessException(HttpStatus status, String code, String message) {
		super(code);
		this.publicMessage = message;
		this.status = status;
		this.code = code;
	}

	public String publicMessage() {
		return publicMessage;
	}

	public HttpStatus status() {
		return status;
	}

	public String code() {
		return code;
	}
}
