package com.moahome.server.expense.controller;

import java.util.UUID;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.expense.dto.PayableRequests;
import com.moahome.server.expense.dto.PayableResponse;
import com.moahome.server.expense.service.PayableService;

@RestController
@Tag(name = "미지급금")
@SecurityRequirement(name = "bearerAuth")
@RequestMapping("/api/properties/{propertyId}/accounting/payables")
public class PayableController {
	private final PayableService service;

	public PayableController(PayableService service) {
		this.service = service;
	}

	@GetMapping
	public ResponseEntity<PayableResponse.Workspace> get(@AuthenticationPrincipal AuthPrincipal user, @PathVariable UUID propertyId) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.workspace(UUID.fromString(user.userId()), propertyId));
	}

	@PostMapping
	public ResponseEntity<Void> create(@AuthenticationPrincipal AuthPrincipal user, @PathVariable UUID propertyId,
		@Valid @RequestBody PayableRequests.Create request) {
		service.create(UUID.fromString(user.userId()), propertyId, request);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}

	@PostMapping("/{payableId}/payments")
	public ResponseEntity<Void> settle(@AuthenticationPrincipal AuthPrincipal user, @PathVariable UUID propertyId,
		@PathVariable UUID payableId, @Valid @RequestBody PayableRequests.Settle request) {
		service.settle(UUID.fromString(user.userId()), propertyId, payableId, request);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}

	@PostMapping("/{payableId}/payments/{paymentId}/cancel")
	public ResponseEntity<Void> cancelPayment(@AuthenticationPrincipal AuthPrincipal user, @PathVariable UUID propertyId,
		@PathVariable UUID payableId, @PathVariable UUID paymentId) {
		service.cancelPayment(UUID.fromString(user.userId()), propertyId, payableId, paymentId);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}

	@PostMapping("/{payableId}/cancel")
	public ResponseEntity<Void> cancel(@AuthenticationPrincipal AuthPrincipal user, @PathVariable UUID propertyId,
		@PathVariable UUID payableId) {
		service.cancel(UUID.fromString(user.userId()), propertyId, payableId);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}
}
