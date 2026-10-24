package com.moahome.server.banking.controller;

import java.util.*;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.banking.dto.*;
import com.moahome.server.banking.service.BankBalanceCheckService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@io.swagger.v3.oas.annotations.tags.Tag(name = "은행 잔액 확인")
@io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/api/properties/{propertyId}/banking/balances/checks")
public class BankBalanceCheckController {
	private final BankBalanceCheckService service;
	public BankBalanceCheckController(BankBalanceCheckService service) {
		this.service = service;
	}

	@PostMapping
	public ResponseEntity<Map<String, Boolean>> create(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @Valid @RequestBody BankBalanceCheckRequests.Create input) {
		service.create(UUID.fromString(actor.userId()), propertyId, input);
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("saved", true));
	}

	@GetMapping
	public ResponseEntity<BankBalanceCheckResponse> history(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @RequestParam UUID accountId) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
		    .body(service.history(UUID.fromString(actor.userId()), propertyId, accountId));
	}

	@PostMapping("/{id}/cancel")
	public ResponseEntity<Map<String, Boolean>> cancel(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @PathVariable UUID id,
	    @Valid @RequestBody BankBalanceCheckRequests.Cancel input) {
		service.cancel(UUID.fromString(actor.userId()), propertyId, id, input);
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("saved", true));
	}
}
