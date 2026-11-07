package com.moahome.server.expense.dto;

import java.time.LocalDate;
import java.util.UUID;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class PayableRequests {
	private PayableRequests() {
	}

	public record Create(@NotNull UUID id, @NotNull LocalDate date,
		@NotBlank @Size(max = 100) String name, @NotBlank @Size(max = 100) String counterparty,
		@Size(max = 500) String memo, @NotNull UUID accountId, UUID buildingId,
		@NotBlank @Pattern(regexp = "[0-9]{1,15}") String amount) {
	}

	public record Settle(@NotNull UUID id, @NotNull UUID expenseId) {
	}
}
