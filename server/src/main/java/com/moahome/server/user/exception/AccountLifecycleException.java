package com.moahome.server.user.exception;

public class AccountLifecycleException extends RuntimeException {
	private final String code;

	public AccountLifecycleException(String code) {
		super(code);
		this.code = code;
	}

	public String code() {
		return code;
	}
}
