package com.moahome.server.banking.dto;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import com.moahome.server.common.validation.TextInput;
public final class BankingRequests {
    private BankingRequests() {}
    public record Allocation(UUID buildingId,@TextInput(max=100,optional=true) String label,
        @Pattern(regexp="[0-9]{1,15}") String amount,@Pattern(regexp="[0-9]{1,3}(\\.[0-9]{1,2})?") String percentage) {
        public Allocation {
            label=com.moahome.server.common.validation.TextValues.optional(label);
            amount=com.moahome.server.common.validation.TextValues.optional(amount);
            percentage=com.moahome.server.common.validation.TextValues.optional(percentage);
        }
    }
    public record Expense(@TextInput(max=100) String category,@TextInput(max=500,optional=true) String note,
        @NotNull @Pattern(regexp="EQUAL|RATIO|AMOUNT") String mode,boolean saveAsRule,
        @NotEmpty @Size(max=100) List<@NotNull @Valid Allocation> allocations) {
        public Expense { note=com.moahome.server.common.validation.TextValues.optional(note); }
    }
    public record Selection(@NotNull UUID id,UUID unitId,@TextInput(max=100,optional=true) String incomeCategory,
        @TextInput(max=500,optional=true) String incomeNote,@Valid Expense expense,@Valid Expense incomeAllocation) {
        public Selection(UUID id,UUID unitId,String incomeCategory,String incomeNote,Expense expense) {
            this(id,unitId,incomeCategory,incomeNote,expense,null);
        }
    }
    public record DeleteMany(@NotEmpty @Size(max=5000) List<@NotNull UUID> transactionIds) {}
    public record Import(@NotEmpty @Size(max=5000) List<@NotNull @Valid Selection> rows) {}
}
