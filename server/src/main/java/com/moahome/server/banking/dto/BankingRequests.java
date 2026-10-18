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
        @TextInput(max=500,optional=true) String incomeNote,@Valid Expense expense,@Valid Expense incomeAllocation,boolean transfer) {
        public Selection(UUID id,UUID unitId,String incomeCategory,String incomeNote,Expense expense,Expense incomeAllocation) { this(id,unitId,incomeCategory,incomeNote,expense,incomeAllocation,false); }
        public Selection(UUID id,UUID unitId,String incomeCategory,String incomeNote,Expense expense) {
            this(id,unitId,incomeCategory,incomeNote,expense,null,false);
        }
    }
    public record DeleteMany(@Size(max=5000) List<@NotNull UUID> transactionIds,@Size(max=1000) List<@NotNull UUID> paymentIds) {
        public DeleteMany {
            transactionIds=transactionIds==null?List.of():transactionIds;
            paymentIds=paymentIds==null?List.of():paymentIds;
        }
        public DeleteMany(List<UUID> transactionIds) { this(transactionIds,List.of()); }
        @AssertTrue(message="INVALID_SELECTION") @com.fasterxml.jackson.annotation.JsonIgnore
        public boolean isSelectionValid() {
            return !transactionIds.isEmpty()||!paymentIds.isEmpty();
        }
    }
    public record Import(@NotEmpty @Size(max=5000) List<@NotNull @Valid Selection> rows,UUID accountId) {
        public Import(List<Selection> rows) { this(rows,null); }
    }
    public record Transfer(@NotNull UUID id,@NotNull UUID outgoingId,@NotNull UUID incomingId) {}
}
