package com.moahome.server.membership.controller;

import java.util.UUID;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.membership.dto.*;
import com.moahome.server.membership.service.*;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import lombok.RequiredArgsConstructor;

@io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "bearerAuth")
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/resident-invitations")
public class ResidentInvitationClaimController {
	private final ResidentInvitationService service;

	private final ResidentJoinCodeService codes;

	private final MembershipRequestService requests;
	@PostMapping("/preview")
	public ResponseEntity<ResidentInvitations.Preview> preview(@AuthenticationPrincipal AuthPrincipal actor,
	    @Valid @RequestBody ResidentInvitations.Token input) {
		return safe(service.preview(UUID.fromString(actor.userId()), input.token()));
	}

	@PostMapping("/accept")
	public ResponseEntity<ResidentInvitations.Result> accept(@AuthenticationPrincipal AuthPrincipal actor,
	    @Valid @RequestBody ResidentInvitations.Claim input) {
		return safe(service.accept(UUID.fromString(actor.userId()), input));
	}

	@PostMapping("/shared-options")
	public ResponseEntity<SignupRequests.Options> options(@AuthenticationPrincipal AuthPrincipal actor,
	    @Valid @RequestBody ResidentInvitations.Token input) {
		return safe(requests.options(UUID.fromString(actor.userId()), codes.property(input.token()), input.token()));
	}

	private <T> ResponseEntity<T> safe(T value) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value);
	}
}
