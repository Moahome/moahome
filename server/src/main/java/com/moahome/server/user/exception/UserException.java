package com.moahome.server.user.exception;

public class UserException extends RuntimeException {
	private final UserErrorCode code;

	public UserException(UserErrorCode code) {
		super(code.name());
		this.code = code;
	}

	public UserErrorCode code() {
		return code;
	}
}
