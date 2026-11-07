package com.moahome.server.accounting.dto;

import java.util.UUID;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import com.moahome.server.accounting.domain.IncomeGroup;

public final class AccountingRequests {
	private AccountingRequests() {
	}

	public record Configure(
		@NotBlank @Pattern(regexp = "[1-9][0-9]{3}-(0[1-9]|1[0-2])") String startMonth,
		@Min(1) @Max(12) int fiscalYearStartMonth) {
	}

	public record CreateAccount(@NotBlank @Size(max = 100) String name, @NotNull IncomeGroup group,
		@Pattern(regexp = "[12489][0-9]{2}") String code) {
	}

	public record EditAccount(@NotBlank @Size(max = 100) String name, @NotNull IncomeGroup group,
		@NotBlank @Pattern(regexp = "[12489][0-9]{2}") String code,
		@NotNull @Min(0) Integer expectedRevision) {
	}

	public record AccountStatus(@NotNull Boolean active, @NotNull @Min(0) Integer expectedRevision) {
	}

	public record DeleteAccount(@NotNull @Min(0) Integer expectedRevision) {
	}

	public record ReviewExpense(@NotNull UUID accountId,
		@Pattern(regexp = "[1-9][0-9]{3}-(0[1-9]|1[0-2])") String recognitionMonth,
		@NotNull @Min(0) Integer expectedRevision, @Size(max = 500) String reason, UUID counterpartPaymentId) {
		public ReviewExpense(UUID accountId, String recognitionMonth, Integer expectedRevision, String reason) {
			this(accountId, recognitionMonth, expectedRevision, reason, null);
		}
	}

	public record ReviewRevenue(@NotNull Boolean recognized, @NotNull @Min(0) Integer expectedRevision,
		@Size(max = 500) String reason) {
	}
}
