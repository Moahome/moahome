package com.moahome.server.accounting.controller;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import com.moahome.server.accounting.dto.AccountingAccountSettings;
import com.moahome.server.accounting.dto.AccountingRequests;
import com.moahome.server.accounting.service.AccountingAccountSettingsService;
import com.moahome.server.auth.domain.AuthPrincipal;

@Tag(name = "계정과목 설정")
@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/api/properties/{propertyId}/accounting/accounts")
public class AccountingAccountController {
	private final AccountingAccountSettingsService service;

	public AccountingAccountController(AccountingAccountSettingsService service) {
		this.service = service;
	}

	@GetMapping
	public ResponseEntity<AccountingAccountSettings.Workspace> get(@AuthenticationPrincipal AuthPrincipal user,
		@PathVariable UUID propertyId) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.get(UUID.fromString(user.userId()), propertyId));
	}

	@PostMapping
	public ResponseEntity<Map<String, UUID>> create(@AuthenticationPrincipal AuthPrincipal user,
		@PathVariable UUID propertyId, @Valid @RequestBody AccountingRequests.CreateAccount request) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(Map.of("id", service.create(UUID.fromString(user.userId()), propertyId, request)));
	}

	@PutMapping("/{accountId}")
	public ResponseEntity<Void> edit(@AuthenticationPrincipal AuthPrincipal user, @PathVariable UUID propertyId,
		@PathVariable UUID accountId, @Valid @RequestBody AccountingRequests.EditAccount request) {
		service.edit(UUID.fromString(user.userId()), propertyId, accountId, request);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}

	@PostMapping("/{accountId}/status")
	public ResponseEntity<Void> status(@AuthenticationPrincipal AuthPrincipal user, @PathVariable UUID propertyId,
		@PathVariable UUID accountId, @Valid @RequestBody AccountingRequests.AccountStatus request) {
		service.status(UUID.fromString(user.userId()), propertyId, accountId, request);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}

	@DeleteMapping("/{accountId}")
	public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthPrincipal user, @PathVariable UUID propertyId,
		@PathVariable UUID accountId, @Valid @RequestBody AccountingRequests.DeleteAccount request) {
		service.delete(UUID.fromString(user.userId()), propertyId, accountId, request);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}

	@GetMapping("/{accountId}/history")
	public ResponseEntity<List<AccountingAccountSettings.Change>> history(@AuthenticationPrincipal AuthPrincipal user,
		@PathVariable UUID propertyId, @PathVariable UUID accountId) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(service.history(UUID.fromString(user.userId()), propertyId, accountId));
	}
}
