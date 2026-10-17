package com.moahome.server.membership.controller;
import java.util.UUID;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.membership.dto.SignupRequests;
import com.moahome.server.membership.service.MembershipRequestService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
@RestController @RequestMapping("/api/properties/{propertyId}/membership-requests") @SecurityRequirement(name="bearerAuth")
public class MembershipRequestController {
    private final MembershipRequestService service;
    public MembershipRequestController(MembershipRequestService service) { this.service=service; }
    @GetMapping("/options")
    public ResponseEntity<SignupRequests.Options> options(@AuthenticationPrincipal AuthPrincipal actor,@PathVariable UUID propertyId) {
        return safe(service.options(UUID.fromString(actor.userId()),propertyId));
    }
    @PostMapping
    public ResponseEntity<SignupRequests.Result> request(@AuthenticationPrincipal AuthPrincipal actor,@PathVariable UUID propertyId,@Valid @RequestBody SignupRequests.Create input) {
        return safe(service.request(UUID.fromString(actor.userId()),propertyId,input));
    }
    @GetMapping
    public ResponseEntity<SignupRequests.Workspace> workspace(@AuthenticationPrincipal AuthPrincipal actor,@PathVariable UUID propertyId) {
        return safe(service.workspace(UUID.fromString(actor.userId()),propertyId));
    }
    @PostMapping("/{requestId}/approve")
    public ResponseEntity<SignupRequests.Workspace> approve(@AuthenticationPrincipal AuthPrincipal actor,@PathVariable UUID propertyId,@PathVariable UUID requestId,@Valid @RequestBody SignupRequests.Approve input) {
        return safe(service.approve(UUID.fromString(actor.userId()),propertyId,requestId,input));
    }
    @PostMapping("/{requestId}/reject")
    public ResponseEntity<SignupRequests.Workspace> reject(@AuthenticationPrincipal AuthPrincipal actor,@PathVariable UUID propertyId,@PathVariable UUID requestId,@Valid @RequestBody SignupRequests.Reject input) {
        return safe(service.reject(UUID.fromString(actor.userId()),propertyId,requestId,input));
    }
    private <T> ResponseEntity<T> safe(T result) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result); }
}

