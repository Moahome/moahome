package com.moahome.server.banking.controller;

import java.util.UUID;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.banking.dto.*;
import com.moahome.server.banking.service.BankingService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@io.swagger.v3.oas.annotations.tags.Tag(name = "통장 관리")
@io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/api/properties/{propertyId}/banking")
public class BankingController {
	private final BankingService service;

	public BankingController(BankingService service) {
		this.service = service;
	}

	@GetMapping("/workspace")
	public ResponseEntity<BankingResponse.Workspace> workspace(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId) {
		return ok(service.workspace(UUID.fromString(user.userId()), propertyId));
	}

	@PostMapping(value = "/import/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ResponseEntity<BankingResponse.Preview> preview(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @RequestPart MultipartFile file,
	    @RequestParam(required = false) UUID accountId) {
		return ok(service.preview(UUID.fromString(user.userId()), propertyId, file, accountId));
	}

	@PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ResponseEntity<BankingResponse.Workspace> upload(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @RequestPart MultipartFile file,
	    @Valid @RequestPart BankingRequests.Import selection) {
		return ok(service.upload(UUID.fromString(user.userId()), propertyId, file, selection));
	}

	@PostMapping("/transactions/{id}/expense")
	public ResponseEntity<BankingResponse.Workspace> expense(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @PathVariable UUID id, @Valid @RequestBody BankingRequests.Expense request) {
		return ok(service.confirmExpense(UUID.fromString(user.userId()), propertyId, id, request));
	}

	@PostMapping("/expenses/manual")
	public ResponseEntity<BankingResponse.Workspace> manualExpense(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @Valid @RequestBody BankingRequests.ManualExpense request) {
		return ok(service.manualExpense(UUID.fromString(user.userId()), propertyId, request));
	}

	@PostMapping("/transactions/{id}/income-allocation")
	public ResponseEntity<BankingResponse.Workspace> allocateIncome(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @PathVariable UUID id, @Valid @RequestBody BankingRequests.Expense request) {
		return ok(service.confirmIncomeAllocation(UUID.fromString(user.userId()), propertyId, id, request));
	}

	@PostMapping("/transactions/delete")
	public ResponseEntity<BankingResponse.Workspace> delete(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @Valid @RequestBody BankingRequests.DeleteMany request) {
		return ok(service.deleteMany(UUID.fromString(user.userId()), propertyId, request));
	}

	@PostMapping("/transfers")
	public ResponseEntity<BankingResponse.Workspace> transfer(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @Valid @RequestBody BankingRequests.Transfer request) {
		return ok(service.connectTransfer(UUID.fromString(user.userId()), propertyId, request));
	}

	@PostMapping("/transfers/{id}/cancel")
	public ResponseEntity<BankingResponse.Workspace> cancelTransfer(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @PathVariable UUID id) {
		return ok(service.cancelTransfer(UUID.fromString(user.userId()), propertyId, id));
	}

	private <T> ResponseEntity<T> ok(T body) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
	}
}
