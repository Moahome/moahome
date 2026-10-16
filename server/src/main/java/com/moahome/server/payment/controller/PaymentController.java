package com.moahome.server.payment.controller;
import java.util.UUID;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.payment.dto.*;
import com.moahome.server.payment.service.PaymentService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;

@RestController @RequestMapping("/api/properties/{propertyId}/payments")
@Tag(name="입금 관리") @SecurityRequirement(name="bearerAuth")
public class PaymentController {
    private final PaymentService service;
    public PaymentController(PaymentService service) { this.service=service; }
    @GetMapping("/workspace")
    public ResponseEntity<PaymentResponse.Ledger> workspace(@AuthenticationPrincipal AuthPrincipal user,@PathVariable UUID propertyId) {
        return ok(service.workspace(id(user),propertyId));
    }
    @PostMapping("/manual")
    public ResponseEntity<PaymentResponse.Ledger> manual(@AuthenticationPrincipal AuthPrincipal user,@PathVariable UUID propertyId,@Valid @RequestBody PaymentRequests.Manual request) {
        return ok(service.manual(id(user),propertyId,request));
    }
    @PostMapping("/delete")
    public ResponseEntity<PaymentResponse.Ledger> deleteMany(@AuthenticationPrincipal AuthPrincipal user,@PathVariable UUID propertyId,@Valid @RequestBody PaymentRequests.DeleteMany request) {
        return ok(service.deleteMany(id(user),propertyId,request));
    }
    @DeleteMapping("/{paymentId}")
    public ResponseEntity<PaymentResponse.Ledger> delete(@AuthenticationPrincipal AuthPrincipal user,@PathVariable UUID propertyId,@PathVariable UUID paymentId) {
        return ok(service.delete(id(user),propertyId,paymentId));
    }
    @PostMapping("/confirm-matches")
    public ResponseEntity<PaymentResponse.Ledger> confirmMatches(@AuthenticationPrincipal AuthPrincipal user,@PathVariable UUID propertyId) {
        return ok(service.confirmMatches(id(user),propertyId));
    }
    @PostMapping("/{paymentId}/confirm")
    public ResponseEntity<PaymentResponse.Ledger> confirm(@AuthenticationPrincipal AuthPrincipal user,@PathVariable UUID propertyId,@PathVariable UUID paymentId,@Valid @RequestBody PaymentRequests.Confirm request) {
        return ok(service.confirm(id(user),propertyId,paymentId,request));
    }
    @PostMapping("/{paymentId}/hold")
    public ResponseEntity<PaymentResponse.Ledger> hold(@AuthenticationPrincipal AuthPrincipal user,@PathVariable UUID propertyId,@PathVariable UUID paymentId,@Valid @RequestBody PaymentRequests.Reason request) {
        return ok(service.hold(id(user),propertyId,paymentId,request.reason()));
    }
    @PostMapping("/{paymentId}/resume")
    public ResponseEntity<PaymentResponse.Ledger> resume(@AuthenticationPrincipal AuthPrincipal user,@PathVariable UUID propertyId,@PathVariable UUID paymentId) {
        return ok(service.resume(id(user),propertyId,paymentId));
    }
    @PostMapping("/{paymentId}/cancel")
    public ResponseEntity<PaymentResponse.Ledger> cancel(@AuthenticationPrincipal AuthPrincipal user,@PathVariable UUID propertyId,@PathVariable UUID paymentId,@Valid @RequestBody PaymentRequests.Reason request) {
        return ok(service.cancel(id(user),propertyId,paymentId,request.reason()));
    }
    @PostMapping("/{paymentId}/link")
    public ResponseEntity<PaymentResponse.Ledger> link(@AuthenticationPrincipal AuthPrincipal user,@PathVariable UUID propertyId,@PathVariable UUID paymentId,@Valid @RequestBody PaymentRequests.Link request) {
        return ok(service.link(id(user),propertyId,paymentId,request.paymentId()));
    }
    @PostMapping(value="/import/preview",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<PaymentResponse.ImportPreview> preview(@AuthenticationPrincipal AuthPrincipal user,@PathVariable UUID propertyId,@RequestPart MultipartFile file) {
        return ok(service.preview(id(user),propertyId,file));
    }
    @PostMapping(value="/import",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<PaymentResponse.Ledger> upload(@AuthenticationPrincipal AuthPrincipal user,@PathVariable UUID propertyId,@RequestPart MultipartFile file) {
        return ok(service.importFile(id(user),propertyId,file));
    }
    private UUID id(AuthPrincipal user) { return UUID.fromString(user.userId()); }
    private <T> ResponseEntity<T> ok(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }
}
