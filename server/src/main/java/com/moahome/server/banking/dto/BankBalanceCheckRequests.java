package com.moahome.server.banking.dto;

import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.validation.constraints.*;

public final class BankBalanceCheckRequests {
	private BankBalanceCheckRequests() {
	}

	public record Create(@NotNull UUID id, @NotNull UUID accountId,
	    @NotNull @Pattern(regexp = "[0-9]{1,15}") String amount, @NotNull OffsetDateTime checkedAt,
	    @NotNull @Pattern(regexp = "BANK_APP|INTERNET_BANKING|OTHER") String sourceType, @Size(max = 500) String memo) {
		@Override
		public String toString() {
			return "BalanceCheckCreate[REDACTED]";
		}
	}

	public record Cancel(@NotNull UUID id, @NotBlank @Size(max = 500) String reason) {
		@Override
		public String toString() {
			return "BalanceCheckCancel[REDACTED]";
		}
	}
}
