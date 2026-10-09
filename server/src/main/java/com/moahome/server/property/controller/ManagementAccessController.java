package com.moahome.server.property.controller;

import java.util.UUID;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.security.AuthErrorHandler.ErrorResponse;
import com.moahome.server.property.dto.ManagedPropertiesResponse;
import com.moahome.server.property.dto.ManagementPropertyResponse;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.user.exception.UserException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "관리 영역 접근", description = "본인의 관리대상 목록과 현재 관리 권한 조회")
@SecurityRequirement(name = "bearerAuth")
public class ManagementAccessController {
	private final ManagementAccessService management;

	public ManagementAccessController(ManagementAccessService management) {
		this.management = management;
	}

	/** 클라이언트 입력 사용자 ID 대신 검증된 Bearer 계정의 관리대상을 조회합니다. */
	@GetMapping("/api/users/me/managed-properties")
	@Operation(summary = "내 관리대상 목록", description = "현재 ADMIN·MANAGER 참여와 활성 관리대상만 반환합니다.")
	public ResponseEntity<ManagedPropertiesResponse> list(@Parameter(hidden = true) @AuthenticationPrincipal AuthPrincipal principal) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(management.getManagedProperties(UUID.fromString(principal.userId())));
	}

	/** URL 식별자를 검증한 뒤 서버의 현재 권한으로 직접 진입을 확인합니다. */
	@GetMapping("/api/properties/{propertyId}/management-context")
	@Operation(summary = "관리대상의 현재 관리 권한 확인")
	public ResponseEntity<ManagementPropertyResponse> context(@Parameter(hidden = true) @AuthenticationPrincipal AuthPrincipal principal,
		@PathVariable String propertyId) {
		if (!propertyId.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
			throw new AuthException(AuthErrorCode.INVALID_REQUEST);
		}
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(management.getManagementContext(UUID.fromString(principal.userId()), UUID.fromString(propertyId)));
	}

	@ExceptionHandler(AuthException.class)
	public ResponseEntity<ErrorResponse> auth(AuthException exception) {
		var code = exception.code();
		return error(code.status().value(), code.name(), code.message());
	}

	@ExceptionHandler(UserException.class)
	public ResponseEntity<ErrorResponse> unavailableAccount(UserException exception) {
		return error(403, "ACCOUNT_UNAVAILABLE", AuthErrorCode.ACCOUNT_UNAVAILABLE.message());
	}

	/** SQL·계정 정보·내부 예외를 숨기고 실패를 빈 목록이나 성공 응답으로 바꾸지 않습니다. */
	@ExceptionHandler(Exception.class)
	public ResponseEntity<ErrorResponse> unexpected(Exception exception) {
		return error(500, "INTERNAL_SERVER_ERROR", "요청을 처리하지 못했습니다.");
	}

	private ResponseEntity<ErrorResponse> error(int status, String code, String message) {
		return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(new ErrorResponse(code, message));
	}
}
