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
@RequestMapping("/api/properties/{propertyId}/members")
public class MemberManagementController {
	private final MemberManagementService service;

	public MemberManagementController(MemberManagementService service) {
		this.service = service;
	}

	@GetMapping
	public ResponseEntity<MemberResponse.Workspace> workspace(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId) {
		return safe(service.workspace(UUID.fromString(actor.userId()), propertyId));
	}

	/** 계정 ID를 입력받지 않고 인증된 본인의 참여만 종료합니다. */
	@io.swagger.v3.oas.annotations.Operation(summary = "본인 나가기", description = "서비스 참여 종료 또는 본인 퇴거를 선택합니다. 관리소장은 인계가 필요합니다.")
	@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "참여 종료 성공")
	@PostMapping("/me/leave")
	public ResponseEntity<Void> leave(@AuthenticationPrincipal AuthPrincipal actor, @PathVariable UUID propertyId,
	    @Valid @RequestBody MemberRequests.Leave input) {
		service.leave(UUID.fromString(actor.userId()), propertyId, input);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}

	/** 인증된 현재 관리소장 본인 계정으로만 연결합니다. */
	@PutMapping("/me/resident")
	public ResponseEntity<Void> ownResident(@AuthenticationPrincipal AuthPrincipal actor, @PathVariable UUID propertyId,
	    @Valid @RequestBody MemberRequests.OwnResident input) {
		service.linkOwnResident(UUID.fromString(actor.userId()), propertyId, input.residentId(),
		    input.expectedUnitId());
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}

	@PutMapping("/{memberId}/role")
	public ResponseEntity<MemberResponse.Workspace> role(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @PathVariable UUID memberId, @Valid @RequestBody MemberRequests.Role input) {
		return safe(service.changeMemberRole(UUID.fromString(actor.userId()), propertyId, memberId, input));
	}

	@PutMapping("/residents/{residentId}/role")
	public ResponseEntity<Void> residentRole(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @PathVariable UUID residentId, @Valid @RequestBody MemberRequests.Role input) {
		service.changeResidentRole(UUID.fromString(actor.userId()), propertyId, residentId, input);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}

	@PostMapping("/{memberId}/transfer")
	public ResponseEntity<Void> transfer(@AuthenticationPrincipal AuthPrincipal actor, @PathVariable UUID propertyId,
	    @PathVariable UUID memberId, @Valid @RequestBody MemberRequests.Role input) {
		if (input.role() != com.moahome.server.membership.domain.PropertyMemberRole.ADMIN)
			throw new IllegalArgumentException("Transfer requires ADMIN");
		service.transfer(UUID.fromString(actor.userId()), propertyId, memberId, input.expectedRole());
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}

	@DeleteMapping("/{memberId}")
	public ResponseEntity<MemberResponse.Workspace> end(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @PathVariable UUID memberId) {
		return safe(service.endManager(UUID.fromString(actor.userId()), propertyId, memberId));
	}

	@PostMapping("/invitations")
	public ResponseEntity<MemberResponse.Issued> invite(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @Valid @RequestBody MemberRequests.Invitation input) {
		return safe(service.issue(UUID.fromString(actor.userId()), propertyId, input.residentId()));
	}

	@PostMapping("/invitations/{invitationId}/approve")
	public ResponseEntity<MemberResponse.Workspace> approve(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @PathVariable UUID invitationId,
	    @Valid @RequestBody MemberRequests.Version input) {
		return safe(service.approve(UUID.fromString(actor.userId()), propertyId, invitationId, input.revision()));
	}

	@PostMapping("/invitations/{invitationId}/revoke")
	public ResponseEntity<MemberResponse.Workspace> revoke(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @PathVariable UUID invitationId,
	    @Valid @RequestBody MemberRequests.Version input) {
		return safe(service.revoke(UUID.fromString(actor.userId()), propertyId, invitationId, input.revision()));
	}

	private <T> ResponseEntity<T> safe(T result) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);
	}
}
