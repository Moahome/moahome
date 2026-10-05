package com.moahome.server.property.controller;

import java.util.UUID;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.property.dto.*;
import com.moahome.server.property.service.PropertyRegistrationService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/property-registrations")
public class PropertyRegistrationController {
	private final PropertyRegistrationService registrations;

	public PropertyRegistrationController(PropertyRegistrationService registrations) {
		this.registrations = registrations;
	}

	/** Bearer 계정의 기본 입력을 검증하며 생성자와 역할을 요청에서 받지 않습니다. */
	@PostMapping("/basic-info/validate")
	public ResponseEntity<BasicInfoRequest> validateBasicInfo(@AuthenticationPrincipal AuthPrincipal principal,
		@Valid @RequestBody BasicInfoRequest request) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(registrations.validateBasicInfo(UUID.fromString(principal.userId()), request));
	}

	/** 트랜잭션 커밋 후 최초 생성은 201, 기존 성공 결과 재반환은 200으로 전달합니다. */
	@PostMapping
	public ResponseEntity<PropertyRegistrationResponse> register(@AuthenticationPrincipal AuthPrincipal principal,
		@Valid @RequestBody PropertyRegistrationRequest request) {
		var outcome = registrations.register(UUID.fromString(principal.userId()), request);
		return ResponseEntity.status(outcome.created() ? HttpStatus.CREATED : HttpStatus.OK)
			.cacheControl(CacheControl.noStore()).body(outcome.response());
	}

	@GetMapping("/{requestId}")
	public ResponseEntity<PropertyRegistrationResponse> getResult(@AuthenticationPrincipal AuthPrincipal principal,
		@PathVariable String requestId) {
		if (!requestId.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
			throw new com.moahome.server.property.exception.RegistrationException(
				com.moahome.server.property.exception.RegistrationErrorCode.INVALID_REQUEST);
		}
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(registrations.getResult(UUID.fromString(principal.userId()), UUID.fromString(requestId)));
	}
}
