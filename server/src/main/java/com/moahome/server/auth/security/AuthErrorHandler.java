package com.moahome.server.auth.security;

import java.io.IOException;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import com.moahome.server.auth.exception.AuthErrorCode;

@Component
public class AuthErrorHandler implements AuthenticationEntryPoint, AccessDeniedHandler {
	private final ObjectMapper mapper;

	public AuthErrorHandler(ObjectMapper mapper) {
		this.mapper = mapper;
	}

	@Override
	public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException exception)
	    throws IOException {
		write(response, AuthErrorCode.AUTHENTICATION_REQUIRED);
	}

	@Override
	public void handle(HttpServletRequest request, HttpServletResponse response,
	    AccessDeniedException exception) throws IOException {
		write(response, exception instanceof CsrfException ? AuthErrorCode.CSRF_INVALID : AuthErrorCode.ACCESS_DENIED);
	}

	public void write(HttpServletResponse response, AuthErrorCode code) throws IOException {
		response.setStatus(code.status().value());
		response.setContentType(MediaType.APPLICATION_JSON_VALUE);
		response.setCharacterEncoding("UTF-8");
		response.setHeader("Cache-Control", "no-store");
		if (code.status().value() == 401) {
			response.setHeader("WWW-Authenticate", "Bearer");
		}
		response.getWriter().write(mapper.writeValueAsString(new ErrorResponse(code.name(), code.message())));
	}

	@Schema(name = "AuthErrorResponse", description = "인증 / 계정 오류. 입력 원문과 토큰은 포함하지 않습니다.")
	public record ErrorResponse(@Schema(example = "AUTHENTICATION_REQUIRED") String code,
	    @Schema(example = "인증이 필요합니다.") String message) {
	}
}
