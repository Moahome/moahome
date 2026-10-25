package com.moahome.server.banking.controller;

import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.banking.dto.BankAccountSettings;
import com.moahome.server.banking.service.BankAccountService;

@RestController
@Tag(name = "관리계좌")
@SecurityRequirement(name = "bearerAuth")
@RequestMapping("/api/properties/{propertyId}/banking/account")
public class BankAccountController {
	private final BankAccountService service;

	public BankAccountController(BankAccountService service) {
		this.service = service;
	}

	@GetMapping
	public ResponseEntity<BankAccountSettings.Response> read(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId) {
		return ok(service.read(UUID.fromString(user.userId()), propertyId));
	}

	@PutMapping
	public ResponseEntity<BankAccountSettings.Response> correct(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @Valid @RequestBody BankAccountSettings.Request request) {
		return ok(service.correct(UUID.fromString(user.userId()), propertyId, request));
	}

	@GetMapping("/{id}")
	public ResponseEntity<BankAccountSettings.Detail> detail(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @PathVariable UUID id) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
		    .body(service.detail(UUID.fromString(user.userId()), propertyId, id));
	}

	@PostMapping("/{id}/number-reveal")
	public ResponseEntity<BankAccountSettings.RevealedNumber> revealNumber(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @PathVariable UUID id) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
		    .body(service.revealNumber(UUID.fromString(user.userId()), propertyId, id));
	}

	@GetMapping("/list")
	public ResponseEntity<List<BankAccountSettings.Response>> list(
	    @AuthenticationPrincipal AuthPrincipal user, @PathVariable UUID propertyId) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
		    .body(service.list(UUID.fromString(user.userId()), propertyId));
	}

	@PostMapping("/save")
	public ResponseEntity<BankAccountSettings.Response> save(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @Valid @RequestBody BankAccountSettings.Save request) {
		return ok(service.save(UUID.fromString(user.userId()), propertyId, request));
	}

	@PostMapping("/{id}/close")
	public ResponseEntity<BankAccountSettings.Response> close(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @PathVariable UUID id, @Valid @RequestBody BankAccountSettings.Close request) {
		return ok(service.close(UUID.fromString(user.userId()), propertyId, id, request));
	}

	private ResponseEntity<BankAccountSettings.Response> ok(BankAccountSettings.Response response) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(response);
	}
}
