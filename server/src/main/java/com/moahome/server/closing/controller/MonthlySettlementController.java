package com.moahome.server.closing.controller;

import java.util.UUID;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.closing.dto.MonthlySettlementResponse;
import com.moahome.server.closing.service.MonthlySettlementService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@io.swagger.v3.oas.annotations.tags.Tag(name = "월별 정산")
@io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/api/properties/{propertyId}/closing/monthly")
public class MonthlySettlementController {
	private final MonthlySettlementService service;

	public MonthlySettlementController(MonthlySettlementService service) {
		this.service = service;
	}

	@GetMapping
	public ResponseEntity<MonthlySettlementResponse> get(@AuthenticationPrincipal AuthPrincipal user,
		@PathVariable UUID propertyId, @RequestParam(required = false) String month) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(service.get(UUID.fromString(user.userId()), propertyId, month));
	}
}
