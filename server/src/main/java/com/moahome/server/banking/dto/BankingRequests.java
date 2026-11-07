package com.moahome.server.banking.dto;

import java.time.LocalDate;
import java.util.*;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import com.moahome.server.common.validation.TextInput;
import com.moahome.server.common.validation.TextValues;

public final class BankingRequests {
	private BankingRequests() {
	}

	public record Allocation(UUID buildingId, @TextInput(max = 100, optional = true) String label,
	    @Pattern(regexp = "[0-9]{1,15}") String amount,
	    @Pattern(regexp = "[0-9]{1,3}(\\.[0-9]{1,2})?") String percentage) {
		public Allocation {
			label = TextValues.optional(label);
			amount = TextValues.optional(amount);
			percentage = TextValues.optional(percentage);
		}
	}

	public record Expense(@TextInput(max = 100) String category, @TextInput(max = 500, optional = true) String note,
	    @NotNull @Pattern(regexp = "EQUAL|RATIO|AMOUNT|PROPERTY") String mode, boolean saveAsRule,
	    @NotNull @Size(max = 100) List<@NotNull @Valid Allocation> allocations,
	    @Pattern(regexp = "8[0-9]{2}") String accountCode) {
		public Expense(String category, String note, String mode, boolean saveAsRule, List<Allocation> allocations) {
			this(category, note, mode, saveAsRule, allocations, null);
		}

		public Expense {
			note = TextValues.optional(note);
		}

		/** 동 없는 공용 지출은 배분을 만들지 않고 나머지 방식에는 실제 부담처를 요구합니다. */
		@AssertTrue(message = "INVALID_ALLOCATION")
		@JsonIgnore
		public boolean isAllocationShapeValid() {
			return hasValidAllocations(mode, allocations);
		}
	}

	public record ManualExpense(@NotNull UUID id, @NotNull UUID accountId,
	    @NotNull LocalDate date, @NotNull @Pattern(regexp = "[0-9]{1,15}") String amount,
	    @TextInput(max = 100) String category, @TextInput(max = 500, optional = true) String note,
	    @NotNull @Pattern(regexp = "EQUAL|RATIO|AMOUNT|PROPERTY") String mode,
	    @NotNull @Size(max = 100) List<@NotNull @Valid Allocation> allocations,
	    @Pattern(regexp = "8[0-9]{2}") String accountCode) {
		public ManualExpense(UUID id, UUID accountId, LocalDate date, String amount, String category, String note,
		    String mode, List<Allocation> allocations) {
			this(id, accountId, date, amount, category, note, mode, allocations, null);
		}

		public ManualExpense {
			note = TextValues.optional(note);
		}

		public Expense expense() {
			return new Expense(category, note, mode, false, allocations, accountCode);
		}

		@AssertTrue(message = "INVALID_ALLOCATION")
		@JsonIgnore
		public boolean isAllocationShapeValid() {
			return hasValidAllocations(mode, allocations);
		}
	}

	private static boolean hasValidAllocations(String mode, List<Allocation> allocations) {
		if (allocations == null || mode == null) return false;
		return "PROPERTY".equals(mode) ? allocations.isEmpty() : !allocations.isEmpty();
	}

	public record Selection(@NotNull UUID id, UUID unitId, @TextInput(max = 100, optional = true) String incomeCategory,
	    @TextInput(max = 500, optional = true) String incomeNote, @Valid Expense expense,
	    @Valid Expense incomeAllocation,
	    // 일반 거래와 이전 클라이언트는 이체 표시를 생략하므로 해당 필드만 false로 기본 처리합니다.
	    @JsonSetter(nulls = Nulls.AS_EMPTY) boolean transfer, UUID transferAccountId, UUID matchTransferId,
	    @Size(max = 100) List<@NotNull @Valid TransferAllocation> transferAllocations) {
		public Selection(UUID id, UUID unitId, String incomeCategory, String incomeNote, Expense expense,
		    Expense incomeAllocation, boolean transfer, UUID transferAccountId, UUID matchTransferId) {
			this(id, unitId, incomeCategory, incomeNote, expense, incomeAllocation, transfer, transferAccountId, matchTransferId, null);
		}
		public Selection(UUID id, UUID unitId, String incomeCategory, String incomeNote, Expense expense,
		    Expense incomeAllocation, boolean transfer) {
			this(id, unitId, incomeCategory, incomeNote, expense, incomeAllocation, transfer, null, null);
		}

		public Selection(UUID id, UUID unitId, String incomeCategory, String incomeNote, Expense expense,
		    Expense incomeAllocation) {
			this(id, unitId, incomeCategory, incomeNote, expense, incomeAllocation, false);
		}

		public Selection(UUID id, UUID unitId, String incomeCategory, String incomeNote, Expense expense) {
			this(id, unitId, incomeCategory, incomeNote, expense, null, false);
		}
	}

	public record DeleteMany(@Size(max = 5000) List<@NotNull UUID> transactionIds,
	    @Size(max = 1000) List<@NotNull UUID> paymentIds,
	    @Size(max = 1000) List<@NotNull UUID> manualExpenseIds) {
		public DeleteMany {
			transactionIds = transactionIds == null ? List.of() : transactionIds;
			paymentIds = paymentIds == null ? List.of() : paymentIds;
			manualExpenseIds = manualExpenseIds == null ? List.of() : manualExpenseIds;
		}

		public DeleteMany(List<UUID> transactionIds, List<UUID> paymentIds) {
			this(transactionIds, paymentIds, List.of());
		}

		public DeleteMany(List<UUID> transactionIds) {
			this(transactionIds, List.of());
		}

		@AssertTrue(message = "INVALID_SELECTION")
		@JsonIgnore
		public boolean isSelectionValid() {
			return !transactionIds.isEmpty() || !paymentIds.isEmpty() || !manualExpenseIds.isEmpty();
		}
	}

	public record Import(@NotEmpty @Size(max = 5000) List<@NotNull @Valid Selection> rows, UUID accountId) {
		public Import(List<Selection> rows) {
			this(rows, null);
		}
	}

	public record ManualTransfer(@NotNull UUID id, @NotNull UUID fromAccountId, @NotNull UUID toAccountId,
		@NotNull LocalDate date, @NotNull @Pattern(regexp = "[0-9]{1,15}") String amount,
		@TextInput(max = 500, optional = true) String note, @NotNull @Size(max = 100) List<@NotNull @Valid TransferAllocation> allocations) {
		public ManualTransfer {
			note = TextValues.optional(note);
			allocations = allocations == null ? List.of() : List.copyOf(allocations);
		}
	}

	public record TransferFromTransaction(@NotNull UUID id, @NotNull UUID transactionId,
	    @NotNull UUID counterpartAccountId,
	    @Size(max = 100) List<@NotNull @Valid TransferAllocation> allocations) {
		public TransferFromTransaction(UUID id, UUID transactionId, UUID counterpartAccountId) {
			this(id, transactionId, counterpartAccountId, null);
		}
	}

	public record TransferAllocation(@NotNull UUID buildingId, @NotNull @Pattern(regexp = "[0-9]{1,15}") String amount) {
	}

	public record TransferAllocations(@NotEmpty @Size(max = 100) List<@NotNull @Valid TransferAllocation> allocations) {
	}

	public record Transfer(@NotNull UUID id, @NotNull UUID outgoingId, @NotNull UUID incomingId) {
	}
}
