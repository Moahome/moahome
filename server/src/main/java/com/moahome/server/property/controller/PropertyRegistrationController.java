package com.moahome.server.property.controller;

import java.util.UUID;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.property.dto.*;
import com.moahome.server.property.service.PropertyRegistrationService;
import com.moahome.server.auth.security.AuthErrorHandler;
import com.moahome.server.property.exception.RegistrationExceptionHandler;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/property-registrations")
@Tag(name = "관리대상 등록", description = "기본 정보 검증, 최종 일괄 저장과 등록 결과 조회")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
	@ApiResponse(responseCode = "400", description = "INVALID_REQUEST: 잘못된 입력 또는 요청 형식",
		content = @Content(mediaType = "application/json", schema = @Schema(implementation = RegistrationExceptionHandler.ErrorResponse.class))),
	@ApiResponse(responseCode = "401", description = "인증 없음, 유효하지 않거나 만료된 토큰 / 세션",
		content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorHandler.ErrorResponse.class))),
	@ApiResponse(responseCode = "403", description = "ACCOUNT_UNAVAILABLE / ACCESS_DENIED",
		content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorHandler.ErrorResponse.class))),
	@ApiResponse(responseCode = "500", description = "INTERNAL_SERVER_ERROR",
		content = @Content(mediaType = "application/json", schema = @Schema(implementation = RegistrationExceptionHandler.ErrorResponse.class))),
	@ApiResponse(responseCode = "503", description = "AUTH_SERVICE_UNAVAILABLE / REGISTRATION_SERVICE_UNAVAILABLE",
		content = @Content(mediaType = "application/json", schema = @Schema(implementation = RegistrationExceptionHandler.ErrorResponse.class)))
})
public class PropertyRegistrationController {
	private final PropertyRegistrationService registrations;

	public PropertyRegistrationController(PropertyRegistrationService registrations) {
		this.registrations = registrations;
	}

	/** Bearer 계정의 기본 입력을 검증하며 생성자와 역할을 요청에서 받지 않습니다. */
	@PostMapping("/basic-info/validate")
	@Operation(summary = "기본 정보 검증", description = "입력을 검증·정리해 반환합니다. 업무 데이터는 저장하지 않습니다.")
	@ApiResponse(responseCode = "200", description = "검증·정리된 기본 정보",
		content = @Content(mediaType = "application/json", schema = @Schema(implementation = BasicInfoRequest.class)))
	@ApiResponse(responseCode = "415", description = "UNSUPPORTED_MEDIA_TYPE: JSON 요청 필요",
		content = @Content(mediaType = "application/json", schema = @Schema(implementation = RegistrationExceptionHandler.ErrorResponse.class)))
	public ResponseEntity<BasicInfoRequest> validateBasicInfo(@Parameter(hidden = true) @AuthenticationPrincipal AuthPrincipal principal,
		@io.swagger.v3.oas.annotations.parameters.RequestBody(required = true,
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = BasicInfoRequest.class)))
		@Valid @RequestBody BasicInfoRequest request) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(registrations.validateBasicInfo(UUID.fromString(principal.userId()), request));
	}

	/** 트랜잭션 커밋 후 최초 생성은 201, 기존 성공 결과 재반환은 200으로 전달합니다. */
	@PostMapping
	@Operation(summary = "관리대상과 초기 설정 일괄 등록", description = "관리대상, 동·세대, 공용계좌, 기본 관리비와 생성자 ADMIN 참여를 "
		+ "한 트랜잭션으로 저장합니다. 같은 requestId와 정규화 본문으로 재요청하면 기존 성공 결과를 반환합니다. "
		+ "응답 유실 시 같은 requestId로 결과를 조회하거나 재시도합니다. 업무 API에는 CSRF 헤더가 필요하지 않습니다.")
	@ApiResponses({
		@ApiResponse(responseCode = "201", description = "최초 등록 성공",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = PropertyRegistrationResponse.class))),
		@ApiResponse(responseCode = "200", description = "동일 요청의 기존 성공 결과",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = PropertyRegistrationResponse.class))),
		@ApiResponse(responseCode = "409", description = "REGISTRATION_REQUEST_CONFLICT: 같은 requestId의 본문 변경 / REGISTRATION_IN_PROGRESS: 처리 중",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = RegistrationExceptionHandler.ErrorResponse.class))),
		@ApiResponse(responseCode = "415", description = "UNSUPPORTED_MEDIA_TYPE: JSON 요청 필요",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = RegistrationExceptionHandler.ErrorResponse.class)))
	})
	public ResponseEntity<PropertyRegistrationResponse> register(@Parameter(hidden = true) @AuthenticationPrincipal AuthPrincipal principal,
		@io.swagger.v3.oas.annotations.parameters.RequestBody(required = true,
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = PropertyRegistrationRequest.class)))
		@Valid @RequestBody PropertyRegistrationRequest request) {
		var outcome = registrations.register(UUID.fromString(principal.userId()), request);
		return ResponseEntity.status(outcome.created() ? HttpStatus.CREATED : HttpStatus.OK)
			.cacheControl(CacheControl.noStore()).body(outcome.response());
	}

	@GetMapping("/{requestId}")
	@Operation(summary = "등록 결과 조회", description = "본인이 요청한 등록의 성공 결과를 조회합니다. "
		+ "다른 사용자의 requestId도 REGISTRATION_NOT_FOUND로 응답합니다. 저장된 등록 결과에 대한 현재 접근권한을 검증합니다.")
	@ApiResponse(responseCode = "200", description = "등록 성공 결과",
		content = @Content(mediaType = "application/json", schema = @Schema(implementation = PropertyRegistrationResponse.class)))
	@ApiResponse(responseCode = "404", description = "REGISTRATION_NOT_FOUND: 본인의 성공 결과 없음",
		content = @Content(mediaType = "application/json", schema = @Schema(implementation = RegistrationExceptionHandler.ErrorResponse.class)))
	public ResponseEntity<PropertyRegistrationResponse> getResult(@Parameter(hidden = true) @AuthenticationPrincipal AuthPrincipal principal,
		@Parameter(description = "최종 등록에 사용한 중복 방지 ID", schema = @Schema(format = "uuid")) @PathVariable String requestId) {
		if (!requestId.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
			throw new com.moahome.server.property.exception.RegistrationException(
				com.moahome.server.property.exception.RegistrationErrorCode.INVALID_REQUEST);
		}
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(registrations.getResult(UUID.fromString(principal.userId()), UUID.fromString(requestId)));
	}
}
