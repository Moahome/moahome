package com.moahome.server.common.validation;

import java.lang.annotation.*;
import jakarta.validation.Constraint;
import jakarta.validation.Payload;

@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = TextInputValidator.class)
public @interface TextInput {
	int max();
	boolean optional() default false;
	String message() default "INVALID_FORMAT";
	Class<?>[] groups() default {};
	Class<? extends Payload>[] payload() default {};
}
