package com.moahome.server.auth;

public class AuthException extends RuntimeException {
	private final AuthErrorCode code;

	public AuthException(AuthErrorCode code) {
		super(code.message());
		this.code = code;
	}

	public AuthErrorCode code() {
		return code;
	}
}
