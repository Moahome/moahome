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
	    @NotNull @Pattern(regexp = "EQUAL|RATIO|AMOUNT") String mode, boolean saveAsRule,
	    @NotEmpty @Size(max = 100) List<@NotNull @Valid Allocation> allocations) {
		public Expense {
			note = TextValues.optional(note);
		}
	}

	public record ManualExpense(@NotNull UUID id, @NotNull UUID accountId,
	    @NotNull LocalDate date, @NotNull @Pattern(regexp = "[0-9]{1,15}") String amount,
	    @TextInput(max = 100) String category, @TextInput(max = 500, optional = true) String note,
	    @NotNull @Pattern(regexp = "EQUAL|RATIO|AMOUNT") String mode,
	    @NotEmpty @Size(max = 100) List<@NotNull @Valid Allocation> allocations) {
		public ManualExpense {
			note = TextValues.optional(note);
		}

		public Expense expense() {
			return new Expense(category, note, mode, false, allocations);
		}
	}

	public record Selection(@NotNull UUID id, UUID unitId, @TextInput(max = 100, optional = true) String incomeCategory,
	    @TextInput(max = 500, optional = true) String incomeNote, @Valid Expense expense,
	    @Valid Expense incomeAllocation,
	    // 일반 거래와 이전 클라이언트는 이체 표시를 생략하므로 해당 필드만 false로 기본 처리합니다.
	    @JsonSetter(nulls = Nulls.AS_EMPTY) boolean transfer) {
		public Selection(UUID id, UUID unitId, String incomeCategory, String incomeNote, Expense expense,
		    Expense incomeAllocation) {
			this(id, unitId, incomeCategory, incomeNote, expense, incomeAllocation, false);
		}

		public Selection(UUID id, UUID unitId, String incomeCategory, String incomeNote, Expense expense) {
			this(id, unitId, incomeCategory, incomeNote, expense, null, false);
		}
	}

	public record DeleteMany(@Size(max = 5000) List<@NotNull UUID> transactionIds,
	    @Size(max = 1000) List<@NotNull UUID> paymentIds) {
		public DeleteMany {
			transactionIds = transactionIds == null ? List.of() : transactionIds;
			paymentIds = paymentIds == null ? List.of() : paymentIds;
		}

		public DeleteMany(List<UUID> transactionIds) {
			this(transactionIds, List.of());
		}

		@AssertTrue(message = "INVALID_SELECTION")
		@JsonIgnore
		public boolean isSelectionValid() {
			return !transactionIds.isEmpty() || !paymentIds.isEmpty();
		}
	}

	public record Import(@NotEmpty @Size(max = 5000) List<@NotNull @Valid Selection> rows, UUID accountId) {
		public Import(List<Selection> rows) {
			this(rows, null);
		}
	}

	public record Transfer(@NotNull UUID id, @NotNull UUID outgoingId, @NotNull UUID incomingId) {
	}
}
