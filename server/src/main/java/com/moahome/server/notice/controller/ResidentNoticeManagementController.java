package com.moahome.server.notice.controller;

import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.notice.dto.ResidentNoticeResponse;
import com.moahome.server.notice.service.ResidentNoticeService;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@Tag(name = "주민 공지 관리")
@SecurityRequirement(name = "bearerAuth")
@RequestMapping("/api/properties/{propertyId}/resident-notices")
public class ResidentNoticeManagementController {

	private final ResidentNoticeService service;

	public ResidentNoticeManagementController(ResidentNoticeService service) {
		this.service = service;
	}

	@GetMapping("/access-link")
	public ResponseEntity<ResidentNoticeResponse.Link> active(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId) {
		return ok(service.activeLink(UUID.fromString(actor.userId()), propertyId));
	}

	@PutMapping("/access-link/{id}")
	public ResponseEntity<ResidentNoticeResponse.Link> create(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @PathVariable UUID id) {
		return ok(service.createLink(UUID.fromString(actor.userId()), propertyId, id));
	}

	@DeleteMapping("/access-link/{id}")
	public ResponseEntity<Void> revoke(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @PathVariable UUID id) {
		service.revoke(UUID.fromString(actor.userId()), propertyId, id);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}

	private <T> ResponseEntity<T> ok(T value) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value);
	}
}
