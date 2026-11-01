package com.moahome.server.dashboard.controller;

import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.dashboard.dto.DashboardResponse;
import com.moahome.server.dashboard.service.DashboardService;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "관리 대시보드")
@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/api/properties/{propertyId}/dashboard")
public class DashboardController {
	private final DashboardService service;

	public DashboardController(DashboardService service) {
		this.service = service;
	}

	@GetMapping
	public ResponseEntity<DashboardResponse> get(@AuthenticationPrincipal AuthPrincipal user,
		@PathVariable UUID propertyId, @RequestParam(required = false) String month) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(service.get(UUID.fromString(user.userId()), propertyId, month));
	}
}
