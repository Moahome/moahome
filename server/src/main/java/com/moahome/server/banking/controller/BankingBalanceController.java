package com.moahome.server.banking.controller;

import java.util.*;
import java.time.LocalDate;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.banking.dto.*;
import com.moahome.server.banking.service.BankingBalanceService;
import com.moahome.server.billing.service.BankBillingStartService;
import com.moahome.server.billing.dto.BankBillingImpact;

@Tag(name = "동별 잔고·정산")
@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/api/properties/{propertyId}/banking/balances")
public class BankingBalanceController {
	private final BankingBalanceService service;
	private final BankBillingStartService billingStart;

	public BankingBalanceController(BankingBalanceService service, BankBillingStartService billingStart) {
		this.service = service;
		this.billingStart = billingStart;
	}

	@GetMapping("/initial-billing-impact")
	public ResponseEntity<BankBillingImpact> billingImpact(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @RequestParam LocalDate cutoffDate,
	    @RequestParam(required = false) UUID accountId) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
		    .body(billingStart.preview(UUID.fromString(user.userId()), propertyId, accountId, cutoffDate));
	}

	@GetMapping
	public ResponseEntity<BankingBalanceResponse.Workspace> workspace(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @RequestParam String month, @RequestParam(required = false) UUID accountId,
	    @RequestParam(required = false) String startMonth) {
		// 기존 단일 월 호출은 유지하고 시작 월이 주어지면 같은 조회에서 기간 전체를 계산합니다.
		var data = startMonth == null
		    ? service.workspace(UUID.fromString(user.userId()), propertyId, month, accountId)
		    : service.workspace(UUID.fromString(user.userId()), propertyId, startMonth, month, accountId);
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
		    .body(data);
	}

	@PostMapping("/account-openings")
	public ResponseEntity<Map<String, Boolean>> accountOpening(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @Valid @RequestBody BankingBalanceRequests.AccountOpening request) {
		service.saveAccountOpening(UUID.fromString(user.userId()), propertyId, request);
		return saved();
	}

	@PostMapping("/openings")
	public ResponseEntity<Map<String, Boolean>> openings(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @Valid @RequestBody BankingBalanceRequests.Opening request) {
		service.saveOpenings(UUID.fromString(user.userId()), propertyId, request);
		return saved();
	}

	@PostMapping("/openings/corrections")
	public ResponseEntity<Map<String, Boolean>> correctOpenings(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @Valid @RequestBody BankingBalanceRequests.OpeningCorrection request) {
		service.correctOpenings(UUID.fromString(user.userId()), propertyId, request);
		return saved();
	}

	@PostMapping("/income-assignments")
	public ResponseEntity<Map<String, Boolean>> assign(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @Valid @RequestBody BankingBalanceRequests.IncomeAssignment request) {
		service.assignIncome(UUID.fromString(user.userId()), propertyId, request);
		return saved();
	}

	@PostMapping("/settlements")
	public ResponseEntity<Map<String, Boolean>> settle(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @Valid @RequestBody BankingBalanceRequests.Settlement request) {
		service.settle(UUID.fromString(user.userId()), propertyId, request);
		return saved();
	}

	@PostMapping("/settlement-decisions")
	public ResponseEntity<Map<String, Boolean>> decide(@AuthenticationPrincipal AuthPrincipal user,
	    @PathVariable UUID propertyId, @Valid @RequestBody BankingBalanceRequests.SettlementDecision request) {
		service.decideSettlement(UUID.fromString(user.userId()), propertyId, request);
		return saved();
	}

	private ResponseEntity<Map<String, Boolean>> saved() {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("saved", true));
	}
}
