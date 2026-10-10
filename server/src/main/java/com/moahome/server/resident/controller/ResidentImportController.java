package com.moahome.server.resident.controller;

import java.util.UUID;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.resident.dto.*;
import com.moahome.server.resident.service.ResidentImportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/properties/{propertyId}/resident-imports")
@Tag(name = "주민 목록", description = "관리소장의 주민 명부 관리")
@SecurityRequirement(name = "bearerAuth")
public class ResidentImportController {
    private final ResidentImportService service;
    public ResidentImportController(ResidentImportService service) { this.service = service; }

    /** 파일을 검증하는 단계에서는 주민을 등록하지 않고 마스킹한 행별 결과만 반환합니다. */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "주민 엑셀 검증")
    public ResponseEntity<ResidentImportResponse> preview(@AuthenticationPrincipal AuthPrincipal actor,
        @PathVariable String propertyId, @RequestPart("file") MultipartFile file) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.preview(UUID.fromString(actor.userId()), uuid(propertyId), file));
    }

    /** 작성자가 검증한 정상 행만 선택할 수 있으며 오류·중복은 행별 결과에 남기고 제외합니다. */
    @PostMapping("/{importId}/commit")
    @Operation(summary = "검증한 주민 일괄 등록")
    public ResponseEntity<ResidentImportResponse> commit(@AuthenticationPrincipal AuthPrincipal actor,
        @PathVariable String propertyId, @PathVariable String importId, @Valid @RequestBody ResidentImportCommitRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.commit(UUID.fromString(actor.userId()), uuid(propertyId), uuid(importId), request));
    }
    private UUID uuid(String input) {
        if (!input.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) throw new IllegalArgumentException("Invalid identifier");
        return UUID.fromString(input);
    }
}
