package com.moahome.server.systemadmin.controller;

import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.systemadmin.dto.SystemAdminRequests;
import com.moahome.server.systemadmin.dto.SystemAdminResponse;
import com.moahome.server.systemadmin.service.SystemAdminService;

@Validated
@RestController
@RequestMapping("/api/system-admin/users")
@SecurityRequirement(name = "bearerAuth")
@Tag(name = "시스템 관리", description = "회원의 관리대상 생성 권한과 시스템 관리자 지정")
public class SystemAdminController {
	private final SystemAdminService service;

	public SystemAdminController(SystemAdminService service) {
		this.service = service;
	}

	/** 호출자의 현재 DB 역할을 서비스에서 확인한 뒤 검색 결과를 캐시하지 않고 반환합니다. */
	@GetMapping
	public ResponseEntity<SystemAdminResponse.Members> list(@AuthenticationPrincipal AuthPrincipal principal,
	    @RequestParam(defaultValue = "") @Size(max = 100) String query,
	    @RequestParam(defaultValue = "false") boolean administrators,
	    @RequestParam(defaultValue = "1") @Min(1) int page,
	    @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
		return ok(service.list(actor(principal), query, administrators, page, size));
	}

	@GetMapping("/{userId}")
	public ResponseEntity<SystemAdminResponse.Member> get(@AuthenticationPrincipal AuthPrincipal principal,
	    @PathVariable UUID userId) {
		return ok(service.get(actor(principal), userId));
	}

	/** 생성 허용은 시스템 역할과 별도로 변경하고 실제 처리자는 인증된 계정만 사용합니다. */
	@PostMapping("/{userId}/creation-permission")
	public ResponseEntity<SystemAdminResponse.Member> permission(@AuthenticationPrincipal AuthPrincipal principal,
	    @PathVariable UUID userId, @Valid @RequestBody SystemAdminRequests.Permission request) {
		return ok(service.changePermission(actor(principal), userId, request));
	}

	@PostMapping("/{userId}/promotion")
	public ResponseEntity<SystemAdminResponse.Member> promote(@AuthenticationPrincipal AuthPrincipal principal,
	    @PathVariable UUID userId, @Valid @RequestBody SystemAdminRequests.Promotion request) {
		return ok(service.promote(actor(principal), userId, request));
	}

	private UUID actor(AuthPrincipal principal) {
		return UUID.fromString(principal.userId());
	}

	private <T> ResponseEntity<T> ok(T value) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value);
	}
}
