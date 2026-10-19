package com.moahome.server.common.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class TextInputValidator implements ConstraintValidator<TextInput, String> {
	private int max;

	private boolean optional;

	@Override
	public void initialize(TextInput constraint) {
		max = constraint.max();
		optional = constraint.optional();
	}

	/** UTF-16 길이가 아닌 코드 포인트 수를 검사하고 안전한 오류 사유만 전달합니다. */
	@Override
	public boolean isValid(String value, ConstraintValidatorContext context) {
		if (TextValues.valid(value, max, optional)) {
			return true;
		}
		String reason = value == null || value.isBlank() ? "REQUIRED" : "TOO_LONG";
		context.disableDefaultConstraintViolation();
		context.buildConstraintViolationWithTemplate(reason).addConstraintViolation();
		return false;
	}
}
