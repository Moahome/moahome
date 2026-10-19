package com.moahome.server.resident.controller;

import java.util.UUID;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.resident.dto.*;
import com.moahome.server.resident.service.ResidentExportService;
import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/properties/{propertyId}/residents/export")
@Tag(name = "주민 엑셀 다운로드", description = "관리소장의 주민 다운로드 미리보기 데이터")
@SecurityRequirement(name = "bearerAuth")
public class ResidentExportController {
	private final ResidentExportService service;

	public ResidentExportController(ResidentExportService service) {
		this.service = service;
	}

	/** 전체 연락처가 포함된 내보내기는 명시적인 POST로만 받고 모든 정상 응답의 저장을 금지합니다. */
	@PostMapping
	@Operation(summary = "주민 엑셀 미리보기 조회", description = "주민명·전체 연락처·동호수만 반환합니다.")
	public ResponseEntity<ResidentExportResponse> export(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable String propertyId, @Valid @RequestBody ResidentExportRequest input) {
		if (!propertyId.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
			throw new IllegalArgumentException("Invalid property ID");
		}
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
		    .body(service.export(UUID.fromString(actor.userId()), UUID.fromString(propertyId), input));
	}
}
