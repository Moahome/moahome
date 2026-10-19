package com.moahome.server.property.exception;

import java.util.List;

public class RegistrationException extends RuntimeException {
	private final RegistrationErrorCode code;

	private final List<FieldError> errors;

	public RegistrationException(RegistrationErrorCode code) {
		this(code, null);
	}

	public RegistrationException(RegistrationErrorCode code, List<FieldError> errors) {
		super(code.message());
		this.code = code;
		this.errors = errors;
	}

	public RegistrationErrorCode code() {
		return code;
	}

	public List<FieldError> errors() {
		return errors;
	}

	public static RegistrationException invalid(String field, String reason, String message) {
		return new RegistrationException(RegistrationErrorCode.INVALID_REQUEST,
		    List.of(new FieldError(field, reason, message)));
	}

	public record FieldError(String field, String reason, String message) {
	}
}
