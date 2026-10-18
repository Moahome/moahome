package com.moahome.server.banking.controller;

import java.util.UUID;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.banking.dto.BankAccountSettings;
import com.moahome.server.banking.service.BankAccountService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@io.swagger.v3.oas.annotations.tags.Tag(name="관리계좌")
@io.swagger.v3.oas.annotations.security.SecurityRequirement(name="bearerAuth")
@RequestMapping("/api/properties/{propertyId}/banking/account")
public class BankAccountController {
    private final BankAccountService service;
    public BankAccountController(BankAccountService service) { this.service=service; }

    @GetMapping
    public ResponseEntity<BankAccountSettings.Response> read(@AuthenticationPrincipal AuthPrincipal user, @PathVariable UUID propertyId) {
        return ok(service.read(UUID.fromString(user.userId()), propertyId));
    }

    @PutMapping
    public ResponseEntity<BankAccountSettings.Response> correct(@AuthenticationPrincipal AuthPrincipal user, @PathVariable UUID propertyId,
        @Valid @RequestBody BankAccountSettings.Request request) {
        return ok(service.correct(UUID.fromString(user.userId()), propertyId, request));
    }

    @GetMapping("/list")
    public ResponseEntity<java.util.List<BankAccountSettings.Response>> list(@AuthenticationPrincipal AuthPrincipal user, @PathVariable UUID propertyId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(UUID.fromString(user.userId()),propertyId));
    }

    @PostMapping("/save")
    public ResponseEntity<BankAccountSettings.Response> save(@AuthenticationPrincipal AuthPrincipal user, @PathVariable UUID propertyId,
        @Valid @RequestBody BankAccountSettings.Save request) {
        return ok(service.save(UUID.fromString(user.userId()),propertyId,request));
    }

    @PostMapping("/{id}/close")
    public ResponseEntity<BankAccountSettings.Response> close(@AuthenticationPrincipal AuthPrincipal user, @PathVariable UUID propertyId,
        @PathVariable UUID id, @Valid @RequestBody BankAccountSettings.Close request) {
        return ok(service.close(UUID.fromString(user.userId()),propertyId,id,request));
    }

    private ResponseEntity<BankAccountSettings.Response> ok(BankAccountSettings.Response response) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(response);
    }
}
