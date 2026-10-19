package com.moahome.server.membership.controller;

import java.util.UUID;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.membership.dto.*;
import com.moahome.server.membership.service.MemberManagementService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/api/member-invitations")
public class InvitationClaimController {
	private final MemberManagementService service;

	public InvitationClaimController(MemberManagementService service) {
		this.service = service;
	}

	@PostMapping("/request")
	public ResponseEntity<MemberResponse.Requested> request(@AuthenticationPrincipal AuthPrincipal actor,
	    @Valid @RequestBody MemberRequests.Claim input) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
		    .body(service.claim(UUID.fromString(actor.userId()), input.code()));
	}
}
