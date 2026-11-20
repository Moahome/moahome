package com.moahome.server.auth.exception;

import com.moahome.server.auth.controller.AppAuthController;
import com.moahome.server.auth.controller.WebAuthController;
import com.moahome.server.common.error.ErrorResponse;
import com.moahome.server.common.error.ErrorResponses;

import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = { WebAuthController.class, AppAuthController.class })
public class AuthExceptionHandler {
	@ExceptionHandler(AuthException.class)
	public ResponseEntity<ErrorResponse> handleAuth(AuthException exception) {
		return response(exception.code());
	}

	@ExceptionHandler({ MethodArgumentNotValidException.class, HttpMessageNotReadableException.class })
	public ResponseEntity<ErrorResponse> handleInvalidRequest(Exception exception) {
		return response(AuthErrorCode.INVALID_REQUEST);
	}

	private ResponseEntity<ErrorResponse> response(AuthErrorCode code) {
		ResponseEntity.BodyBuilder builder = ErrorResponses.builder(code.status());
		if (code.status().value() == 401) {
			builder.header("WWW-Authenticate", "Bearer");
		}
		return builder.body(new ErrorResponse(code.name(), code.message()));
	}
}
