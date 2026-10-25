package com.moahome.server.billing.controller;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.billing.dto.*;
import com.moahome.server.billing.service.OpeningBalanceExcelReader;
import com.moahome.server.billing.service.OpeningBalanceService;

@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/api/properties/{propertyId}/billing/opening-balances")
public class OpeningBalanceController {
	private final OpeningBalanceService service;

	private final OpeningBalanceExcelReader excel;

	public OpeningBalanceController(OpeningBalanceService service,
	    OpeningBalanceExcelReader excel) {
		this.service = service;
		this.excel = excel;
	}

	/** 파일 검증은 저장하지 않으며 현재 대상의 세대 ID만 반환합니다. */
	@PostMapping(value = "/import/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ResponseEntity<List<OpeningBalanceRequest.UnitInput>> preview(
	    @AuthenticationPrincipal AuthPrincipal actor, @PathVariable UUID propertyId,
	    @RequestPart("file") MultipartFile file) {
		var current = service.workspace(UUID.fromString(actor.userId()), propertyId);
		List<OpeningBalanceRequest.UnitInput> rows = excel.read(file);
		Set<UUID> allowed = current.units().stream().map(unit -> unit.unitId())
		    .collect(Collectors.toSet());
		if (rows.stream().anyMatch(row -> !allowed.contains(row.unitId())))
			throw new IllegalArgumentException("Invalid opening target");
		return safe(rows);
	}

	@GetMapping
	public ResponseEntity<OpeningBalanceResponse> workspace(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId) {
		return safe(service.workspace(UUID.fromString(actor.userId()), propertyId));
	}

	@PutMapping
	public ResponseEntity<OpeningBalanceResponse> save(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @Valid @RequestBody OpeningBalanceRequest input) {
		return safe(service.save(UUID.fromString(actor.userId()), propertyId, input));
	}

	@PostMapping("/{batchId}/confirm")
	public ResponseEntity<OpeningBalanceResponse> confirm(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @PathVariable UUID batchId,
	    @Valid @RequestBody OpeningBalanceRequest.Version input) {
		return safe(service.confirm(UUID.fromString(actor.userId()), propertyId, batchId, input.revision()));
	}

	@PostMapping("/{batchId}/cancel")
	public ResponseEntity<OpeningBalanceResponse> cancel(@AuthenticationPrincipal AuthPrincipal actor,
	    @PathVariable UUID propertyId, @PathVariable UUID batchId,
	    @Valid @RequestBody OpeningBalanceRequest.Cancel input) {
		return safe(service.cancel(UUID.fromString(actor.userId()), propertyId, batchId, input));
	}

	private <T> ResponseEntity<T> safe(T result) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);
	}
}
