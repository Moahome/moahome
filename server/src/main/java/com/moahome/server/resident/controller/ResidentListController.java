package com.moahome.server.resident.controller;

import java.util.UUID;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.resident.dto.ResidentListResponse;
import com.moahome.server.resident.service.ResidentListService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/properties/{propertyId}/residents")
@Tag(name = "주민 목록", description = "관리소장의 주민 명부 조회")
@SecurityRequirement(name = "bearerAuth")
public class ResidentListController {
	private final ResidentListService service;
	public ResidentListController(ResidentListService service) { this.service = service; }

	/** 인증 계정과 엄격히 검증한 관리대상 ID로 조회하고 브라우저·중간 캐시에 명부를 남기지 않습니다. */
	@GetMapping
	@Operation(summary = "주민 목록 조회", description = "삭제되지 않은 전체 명부와 연락처 끝 네 자리만 반환합니다.")
	public ResponseEntity<ResidentListResponse> list(@AuthenticationPrincipal AuthPrincipal principal,
		@PathVariable String propertyId) {
		if (!propertyId.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
			throw new IllegalArgumentException("Invalid property ID");
		}
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(service.list(UUID.fromString(principal.userId()), UUID.fromString(propertyId)));
	}
}
