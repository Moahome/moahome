package com.moahome.server.user.controller;

import java.util.UUID;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.auth.security.WebAuthSupport;
import com.moahome.server.user.dto.WithdrawalRequest;
import com.moahome.server.user.dto.WithdrawalReceipt;
import com.moahome.server.user.dto.WithdrawalStatus;
import com.moahome.server.user.service.AccountLifecycleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "사용자", description = "로그인 계정 정보")
@SecurityRequirement(name = "bearerAuth")
public class AccountWithdrawalController {
	private final AccountLifecycleService accounts;
	private final WebAuthSupport web;

	public AccountWithdrawalController(AccountLifecycleService accounts, WebAuthSupport web) {
		this.accounts = accounts;
		this.web = web;
	}

	@GetMapping("/api/users/me/withdrawal")
	@Operation(summary = "내 탈퇴 신청 가능 여부", description = "관리소장인 곳은 인계가 필요합니다. 최종 신청에서도 재검사합니다.")
	public ResponseEntity<WithdrawalStatus> status(@AuthenticationPrincipal AuthPrincipal principal) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
		    .body(accounts.status(UUID.fromString(principal.userId())));
	}

	/** 명시적인 확인을 받고 인증된 본인만 신청하며 즉시 삭제 대신 30일 유예를 시작합니다. */
	@PostMapping("/api/users/me/withdrawal")
	@Operation(summary = "회원 탈퇴 신청", description = "confirmed=true가 필요합니다. 이전 세션을 무효화하고 개인정보를 30일 보관합니다.")
	public ResponseEntity<WithdrawalReceipt> request(@AuthenticationPrincipal AuthPrincipal principal,
	    @Valid @RequestBody WithdrawalRequest request) {
		WithdrawalReceipt receipt = accounts.request(UUID.fromString(principal.userId()));
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header(HttpHeaders.SET_COOKIE, web.clearCookie())
		    .body(receipt);
	}
}
