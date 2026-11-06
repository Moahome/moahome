package com.moahome.server.accounting.exception;

public class AccountingException extends RuntimeException {
	private final String code;

	public AccountingException(String code) {
		super(code);
		this.code = code;
	}

	public String code() {
		return code;
	}
}
