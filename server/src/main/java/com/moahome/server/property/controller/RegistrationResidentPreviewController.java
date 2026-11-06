package com.moahome.server.property.controller;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.property.dto.RegistrationResidentPreview;
import com.moahome.server.property.service.RegistrationResidentPreviewService;

@RestController
@RequestMapping("/api/property-registrations/resident-import")
@SecurityRequirement(name = "bearerAuth")
@Tag(name = "관리대상 등록")
public class RegistrationResidentPreviewController {
	private final RegistrationResidentPreviewService service;

	public RegistrationResidentPreviewController(RegistrationResidentPreviewService service) {
		this.service = service;
	}

	/** 저장 전 초안의 파일 검증만 제공하고 동의한 번호가 포함된 응답은 캐시에 보관하지 않습니다. */
	@PostMapping(value = "/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@Operation(summary = "초기 주민 엑셀 검증", description = "생성 권한과 세대 초안으로 검증하며 파일·임시 명부를 저장하지 않습니다.")
	public ResponseEntity<List<RegistrationResidentPreview.Row>> preview(
	    @AuthenticationPrincipal AuthPrincipal principal,
	    @Valid @RequestPart("setup") RegistrationResidentPreview.Setup setup,
	    @RequestPart("file") MultipartFile file) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
		    .body(service.preview(UUID.fromString(principal.userId()), setup, file));
	}
}
