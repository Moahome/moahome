package com.moahome.server.resident.controller;

import java.util.UUID;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.resident.dto.*;
import com.moahome.server.resident.service.ResidentManagementService;
import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/properties/{propertyId}/residents/{residentId}")
@Tag(name = "주민 상세", description = "관리소장의 주민 상세·연락처 공개·수정·삭제")
@SecurityRequirement(name = "bearerAuth")
public class ResidentManagementController {
    private final ResidentManagementService service;
    public ResidentManagementController(ResidentManagementService service) { this.service = service; }

    /** 인증 계정과 엄격한 UUID로 조회하며 모든 응답의 명부·연락처 캐시를 금지합니다. */
    @GetMapping
    @Operation(summary = "주민 상세 조회")
    public ResponseEntity<ResidentDetailResponse> detail(@AuthenticationPrincipal AuthPrincipal actor, @PathVariable String propertyId, @PathVariable String residentId) {
        return safe(service.detail(UUID.fromString(actor.userId()), id(propertyId), id(residentId)));
    }

    @PostMapping("/phone-reveal")
    @Operation(summary = "주민 연락처 전체 번호 확인")
    public ResponseEntity<PhoneResponse> phone(@AuthenticationPrincipal AuthPrincipal actor, @PathVariable String propertyId, @PathVariable String residentId) {
        return safe(new PhoneResponse(service.revealPhone(UUID.fromString(actor.userId()), id(propertyId), id(residentId))));
    }

    @PutMapping
    @Operation(summary = "주민 정보 수정")
    public ResponseEntity<ResidentDetailResponse> update(@AuthenticationPrincipal AuthPrincipal actor, @PathVariable String propertyId, @PathVariable String residentId, @Valid @RequestBody ResidentUpdateRequest input) {
        return safe(service.update(UUID.fromString(actor.userId()), id(propertyId), id(residentId), input));
    }

    @DeleteMapping
    @Operation(summary = "주민 명부 삭제")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthPrincipal actor, @PathVariable String propertyId, @PathVariable String residentId, @Valid @RequestBody ResidentDeleteRequest input) {
        service.delete(UUID.fromString(actor.userId()), id(propertyId), id(residentId), input);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    private UUID id(String value) {
        if (!value.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) throw new IllegalArgumentException("Invalid ID");
        return UUID.fromString(value);
    }
    private <T> ResponseEntity<T> safe(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }
    public record PhoneResponse(String phone) { @Override public String toString() { return "PhoneResponse[REDACTED]"; } }
}
