package com.moahome.server.systemadmin.exception;

import org.springframework.http.HttpStatus;

public class SystemAdminException extends RuntimeException {
	private final String code;
	private final HttpStatus status;

	public SystemAdminException(String code, HttpStatus status, String message) {
		super(message);
		this.code = code;
		this.status = status;
	}

	public String code() {
		return code;
	}

	public HttpStatus status() {
		return status;
	}
}
