package com.moahome.server.membership.controller;

import java.util.UUID;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.membership.dto.ResidentInvitations;
import com.moahome.server.membership.service.*;

/** 모든 주민 초대 관리 요청은 서비스에서 관리대상 권한을 재검증합니다. */
@SecurityRequirement(name = "bearerAuth")
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/properties/{propertyId}/resident-invitations")
public class ResidentInvitationController {
	private final ResidentInvitationService service;

	private final ResidentJoinCodeService codes;
	@GetMapping
	public ResponseEntity<ResidentInvitations.Workspace> workspace(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId) {
		return safe(service.workspace(UUID.fromString(actor.userId()), propertyId));
	}

	@PostMapping("/shared-code")
	public ResponseEntity<ResidentInvitations.Issued> shared(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId) {
		return safe(codes.issue(UUID.fromString(actor.userId()), propertyId));
	}

	@DeleteMapping("/shared-code")
	public ResponseEntity<Void> revokeShared(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId) {
		codes.revoke(UUID.fromString(actor.userId()), propertyId);
		return safe(null);
	}

	@PostMapping("/residents/{residentId}")
	public ResponseEntity<ResidentInvitations.Issued> issue(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @PathVariable UUID residentId) {
		return safe(service.issue(UUID.fromString(actor.userId()), propertyId, residentId));
	}

	@PostMapping("/{id}/share")
	public ResponseEntity<ResidentInvitations.Issued> share(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @PathVariable UUID id) {
		return safe(service.share(UUID.fromString(actor.userId()), propertyId, id));
	}

	@PostMapping("/{id}/restore")
	public ResponseEntity<ResidentInvitations.Issued> restore(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @PathVariable UUID id, @Valid @RequestBody ResidentInvitations.Token input) {
		return safe(service.restore(UUID.fromString(actor.userId()), propertyId, id, input.token()));
	}

	@PostMapping("/{id}/revoke")
	public ResponseEntity<ResidentInvitations.Workspace> revoke(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @PathVariable UUID id, @Valid @RequestBody ResidentInvitations.Review input) {
		return safe(service.revoke(UUID.fromString(actor.userId()), propertyId, id, input));
	}

	@PostMapping("/{id}/approve")
	public ResponseEntity<ResidentInvitations.Workspace> approve(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @PathVariable UUID id, @Valid @RequestBody ResidentInvitations.Review input) {
		return safe(service.review(UUID.fromString(actor.userId()), propertyId, id, input, true));
	}

	@PostMapping("/{id}/reject")
	public ResponseEntity<ResidentInvitations.Workspace> reject(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @PathVariable UUID id, @Valid @RequestBody ResidentInvitations.Review input) {
		return safe(service.review(UUID.fromString(actor.userId()), propertyId, id, input, false));
	}

	private <T> ResponseEntity<T> safe(T value) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value);
	}
}
