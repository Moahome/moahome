package com.moahome.server.resident.controller;

import java.util.UUID;
import java.util.List;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.resident.dto.*;
import com.moahome.server.resident.service.ResidentRegistrationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/properties/{propertyId}/residents")
@Tag(name = "주민 목록", description = "관리소장의 주민 명부 관리")
@SecurityRequirement(name = "bearerAuth")
public class ResidentRegistrationController {
	private final ResidentRegistrationService service;

	public ResidentRegistrationController(ResidentRegistrationService service) {
		this.service = service;
	}

	/** 삭제한 명부를 명시적으로 선택해 복구할 수 있도록 최소 정보만 반환합니다. */
	@GetMapping("/deleted")
	@Operation(summary = "삭제 명부 복구 선택지", description = "수정 가능한 삭제 주민의 ID와 이름만 반환합니다.")
	public ResponseEntity<List<DeletedResidentOption>> deleted(@AuthenticationPrincipal AuthPrincipal principal,
	    @PathVariable UUID propertyId) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
		    .body(service.deletedResidents(UUID.fromString(principal.userId()), propertyId));
	}

	/** 관리자가 입력한 명부와 현재 세대만 저장하며 주민 계정 연결·가입 승인은 수행하지 않습니다. */
	@PostMapping
	@Operation(summary = "주민 등록", description = "연락처는 선택이며 해당 세대의 최초 등록 주민을 대표로 지정합니다.")
	public ResponseEntity<ResidentRegistrationResponse> register(@AuthenticationPrincipal AuthPrincipal principal,
	    @PathVariable String propertyId, @Valid @RequestBody ResidentRegistrationRequest request) {
		if (!propertyId.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
			throw new IllegalArgumentException("Invalid property ID");
		}
		return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
		    .body(service.register(UUID.fromString(principal.userId()), UUID.fromString(propertyId), request));
	}
}
