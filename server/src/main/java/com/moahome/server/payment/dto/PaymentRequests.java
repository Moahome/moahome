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
    public record BankImportSelection(@NotEmpty @Size(max=5000) List<@NotNull UUID> transactionIds) {}
    public record OtherIncome(@TextInput(max=100) String category, @TextInput(max=500,optional=true) String note) {
        /** 선택 메모는 빈 문자열·공백을 미입력으로 정리한 뒤 Bean Validation을 적용합니다. */
        public OtherIncome { note=com.moahome.server.common.validation.TextValues.optional(note); }
    }
    public record Reason(@TextInput(max=500) String reason) {}
    public record Link(@NotNull UUID paymentId) {}
}
