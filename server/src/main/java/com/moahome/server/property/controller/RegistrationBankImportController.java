package com.moahome.server.property.controller;

import java.util.UUID;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.property.service.RegistrationBankImportService;
import com.moahome.server.banking.dto.BankingResponse;

@RestController
@SecurityRequirement(name = "bearerAuth")
@RequestMapping("/api/property-registrations/bank-import")
public class RegistrationBankImportController {
	private final RegistrationBankImportService imports;

	public RegistrationBankImportController(RegistrationBankImportService imports) {
		this.imports = imports;
	}

	@GetMapping("/support")
	public ResponseEntity<BankingResponse.ImportSupport> support(@AuthenticationPrincipal AuthPrincipal principal,
	    @RequestParam String bankCode) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
		    .body(imports.support(UUID.fromString(principal.userId()), bankCode));
	}

	/** 관리대상 생성 전에도 로그인 계정의 은행 원본만 검증하며 업무 DB에는 쓰지 않습니다. */
	@PostMapping(value = "/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ResponseEntity<RegistrationBankImportService.Preview> preview(
	    @AuthenticationPrincipal AuthPrincipal principal, @RequestPart MultipartFile file,
	    @RequestParam String bankCode) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
		    .body(imports.preview(UUID.fromString(principal.userId()), bankCode, file));
	}
}
