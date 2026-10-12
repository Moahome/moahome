package com.moahome.server.billing.controller;

import java.util.UUID;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.billing.domain.BillingCalendar;
import com.moahome.server.billing.dto.*;
import com.moahome.server.billing.service.BillingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/properties/{propertyId}/billing")
@Tag(name="관리비 부과", description="관리비 현재·예약 설정과 월별 자동 확정 청구 조회")
@SecurityRequirement(name="bearerAuth")
public class BillingController {
    private final BillingService service;
    public BillingController(BillingService service) { this.service=service; }
    /** 인증 계정과 현재 관리대상의 권한으로만 실제 기본 설정을 조회합니다. */
    @GetMapping("/settings")
    @Operation(summary="현재 관리비 설정과 다음 달 적용 예정 설정 조회")
    public ResponseEntity<BillingResponse.Settings> settings(@AuthenticationPrincipal AuthPrincipal principal, @PathVariable String propertyId) {
        return ok(service.settings(UUID.fromString(principal.userId()), id(propertyId)));
    }
    /** 적용월·최신 버전과 필수 사유를 받아 다음 달 설정을 저장합니다. */
    @PutMapping("/settings")
    @Operation(summary="다음 달 적용 관리비 설정 저장")
    public ResponseEntity<BillingResponse.Settings> save(@AuthenticationPrincipal AuthPrincipal principal, @PathVariable String propertyId,
        @Valid @RequestBody BillingSettingsRequest request) {
        return ok(service.saveSettings(UUID.fromString(principal.userId()), id(propertyId), request));
    }
    @GetMapping("/monthly/{month}")
    @Operation(summary="월별 청구 내역 또는 적용 예정 금액 조회")
    public ResponseEntity<BillingResponse.Month> monthly(@AuthenticationPrincipal AuthPrincipal principal, @PathVariable String propertyId,
        @PathVariable String month) {
        return ok(service.monthly(UUID.fromString(principal.userId()), id(propertyId), BillingCalendar.parseMonth(month)));
    }
    @GetMapping("/monthly/{month}/units/{unitId}")
    @Operation(summary="세대별 월 청구 상세 조회")
    public ResponseEntity<BillingResponse.Month> detail(@AuthenticationPrincipal AuthPrincipal principal, @PathVariable String propertyId,
        @PathVariable String month, @PathVariable String unitId) {
        return ok(service.detail(UUID.fromString(principal.userId()), id(propertyId), BillingCalendar.parseMonth(month), id(unitId)));
    }
    @GetMapping("/history")
    @Operation(summary="확정된 월별 부과 이력 조회")
    public ResponseEntity<BillingResponse.History> history(@AuthenticationPrincipal AuthPrincipal principal, @PathVariable String propertyId) {
        return ok(service.history(UUID.fromString(principal.userId()), id(propertyId)));
    }
    /** 상세에서 선택한 청구만 취소하며 같은 세대의 다른 월·관리대상 청구를 변경하지 않습니다. */
    @DeleteMapping("/monthly/{month}/charges/{chargeId}")
    @Operation(summary="당월 세대 청구 취소")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="204", description="취소 완료 또는 이미 취소된 당월 청구")
    public ResponseEntity<Void> cancel(@AuthenticationPrincipal AuthPrincipal principal, @PathVariable String propertyId,
        @PathVariable String month, @PathVariable String chargeId) {
        service.cancelCharge(UUID.fromString(principal.userId()), id(propertyId), BillingCalendar.parseMonth(month), id(chargeId));
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
    private UUID id(String value) {
        if (!value.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) throw new IllegalArgumentException("Invalid identifier");
        return UUID.fromString(value);
    }
    private <T> ResponseEntity<T> ok(T value) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value); }
}
