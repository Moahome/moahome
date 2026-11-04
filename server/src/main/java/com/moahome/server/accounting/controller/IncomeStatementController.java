package com.moahome.server.accounting.controller;

import java.util.Map;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import com.moahome.server.accounting.dto.AccountingRequests;
import com.moahome.server.accounting.dto.IncomeStatementResponse;
import com.moahome.server.accounting.service.AccountingWriteService;
import com.moahome.server.accounting.service.IncomeStatementService;
import com.moahome.server.auth.domain.AuthPrincipal;

@Tag(name = "손익계산서")
@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/api/properties/{propertyId}/accounting")
public class IncomeStatementController {
	private final IncomeStatementService service;

	private final AccountingWriteService writes;

	public IncomeStatementController(IncomeStatementService service, AccountingWriteService writes) {
		this.service = service;
		this.writes = writes;
	}

	@GetMapping("/income-statement")
	public ResponseEntity<IncomeStatementResponse> get(@AuthenticationPrincipal AuthPrincipal user,
		@PathVariable UUID propertyId, @RequestParam(required = false) String startMonth,
		@RequestParam(required = false) String endMonth, @RequestParam(required = false) UUID buildingId) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.get(UUID.fromString(user.userId()),
			propertyId, startMonth, endMonth, buildingId));
	}

	@PostMapping("/settings")
	public ResponseEntity<Void> configure(@AuthenticationPrincipal AuthPrincipal user, @PathVariable UUID propertyId,
		@Valid @RequestBody AccountingRequests.Configure request) {
		writes.configure(UUID.fromString(user.userId()), propertyId, request);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}

	@PostMapping("/accounts")
	public ResponseEntity<Map<String, UUID>> createAccount(@AuthenticationPrincipal AuthPrincipal user,
		@PathVariable UUID propertyId, @Valid @RequestBody AccountingRequests.CreateAccount request) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("id",
			writes.createAccount(UUID.fromString(user.userId()), propertyId, request)));
	}

	@PostMapping("/expenses/{expenseId}/reviews")
	public ResponseEntity<Void> review(@AuthenticationPrincipal AuthPrincipal user, @PathVariable UUID propertyId,
		@PathVariable UUID expenseId, @Valid @RequestBody AccountingRequests.ReviewExpense request) {
		writes.reviewExpense(UUID.fromString(user.userId()), propertyId, expenseId, request);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}

	@PostMapping("/revenue-items/{itemId}/reviews")
	public ResponseEntity<Void> reviewRevenue(@AuthenticationPrincipal AuthPrincipal user, @PathVariable UUID propertyId,
		@PathVariable UUID itemId, @Valid @RequestBody AccountingRequests.ReviewRevenue request) {
		writes.reviewRevenue(UUID.fromString(user.userId()), propertyId, itemId, request);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}
}
