package com.moahome.server.payment.dto;
import java.time.LocalDate;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import com.moahome.server.common.validation.TextInput;
public final class PaymentRequests {
    private PaymentRequests() {}
    public record Manual(@NotNull UUID id, @NotNull UUID unitId, @NotNull @PastOrPresent LocalDate date,
        @NotNull @Pattern(regexp="[0-9]{1,15}") String amount) {}
    public record Allocation(@NotNull UUID chargeId, @NotNull @Pattern(regexp="[0-9]{1,15}") String amount) {}
    public record Confirm(@NotNull UUID unitId, @Size(max=1000) List<@NotNull @Valid Allocation> allocations,
        @TextInput(max=500,optional=true) String separateReason) {}
    public record DeleteMany(@NotEmpty @Size(max=1000) List<@NotNull UUID> paymentIds) {}
    public record OtherIncome(@TextInput(max=100) String category, @TextInput(max=500,optional=true) String note) {}
    public record Reason(@TextInput(max=500) String reason) {}
    public record Link(@NotNull UUID paymentId) {}
}
