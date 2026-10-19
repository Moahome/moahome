package com.moahome.server.resident.exception;

public class ResidentImportException extends RuntimeException {
	private final String code;

	public ResidentImportException(String code) {
		super(code);
		this.code = code;
	}

	public String code() {
		return code;
	}
}
