package com.moahome.server.accounting.controller;

import java.util.UUID;
import java.util.List;
import java.util.ArrayList;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import com.moahome.server.accounting.dto.AccountLedgerResponse;
import com.moahome.server.accounting.service.AccountLedgerService;
import com.moahome.server.auth.domain.AuthPrincipal;

@Tag(name = "계정별 원장")
@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/api/properties/{propertyId}/accounting")
public class AccountLedgerController {
	private final AccountLedgerService service;

	public AccountLedgerController(AccountLedgerService service) {
		this.service = service;
	}

	@GetMapping("/ledger")
	public ResponseEntity<AccountLedgerResponse> get(@AuthenticationPrincipal AuthPrincipal user,
		@PathVariable UUID propertyId, @RequestParam(required = false) String startMonth,
		@RequestParam(required = false) String endMonth, @RequestParam(required = false) UUID buildingId,
		@RequestParam(required = false) UUID accountId,
		@RequestParam(required = false) List<UUID> accountIds,
		@RequestParam(required = false) UUID bankAccountId) {
		if (bankAccountId != null) {
			List<UUID> selected = new ArrayList<>(accountIds == null ? List.of() : accountIds);
			if (accountId != null) selected.add(accountId);
			return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.getSelected(
				UUID.fromString(user.userId()), propertyId, startMonth, endMonth, buildingId, selected, bankAccountId));
		}
		if (accountIds != null) {
			List<UUID> selected = new ArrayList<>(accountIds);
			if (accountId != null) selected.add(accountId);
			return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.getSelected(
				UUID.fromString(user.userId()), propertyId, startMonth, endMonth, buildingId, selected));
		}
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.get(UUID.fromString(user.userId()),
			propertyId, startMonth, endMonth, buildingId, accountId));
	}
}
