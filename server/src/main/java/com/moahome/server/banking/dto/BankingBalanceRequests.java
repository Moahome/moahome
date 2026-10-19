package com.moahome.server.banking.dto;

import java.time.LocalDate;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

public final class BankingBalanceRequests {
	private BankingBalanceRequests() {
	}

	public record AccountOpening(@NotNull UUID id, @NotNull UUID accountId,
	    @NotNull @PastOrPresent LocalDate cutoffDate, @NotNull @Pattern(regexp = "[0-9]{1,15}") String amount,
	    @NotNull @PositiveOrZero Long revision) {
	}

	public record Opening(@NotNull LocalDate cutoffDate,
	    @NotEmpty @Size(max = 1000) List<@NotNull @Valid OpeningPart> buildings, UUID accountId) {
		public Opening(LocalDate cutoffDate, List<OpeningPart> buildings) {
			this(cutoffDate, buildings, null);
		}
	}

	public record OpeningCorrection(@NotNull UUID id, @NotNull LocalDate cutoffDate,
	    @NotEmpty @Size(max = 1000) List<@NotNull @Valid OpeningCorrectionPart> buildings, UUID accountId) {
		public OpeningCorrection(UUID id, LocalDate cutoffDate, List<OpeningCorrectionPart> buildings) {
			this(id, cutoffDate, buildings, null);
		}
	}

	public record OpeningCorrectionPart(@NotNull UUID buildingId,
	    @NotNull @Pattern(regexp = "-?[0-9]{1,15}") String amount, @NotNull @PositiveOrZero Long revision) {
	}

	public record OpeningPart(@NotNull UUID buildingId, @NotNull @Pattern(regexp = "-?[0-9]{1,15}") String amount) {
	}

	public record IncomeAssignment(@NotNull UUID paymentId, @NotNull UUID buildingId) {
	}

	public record SettlementDecision(@NotNull UUID id, @NotNull UUID allocationId, @NotNull Boolean excluded,
	    @NotNull @PositiveOrZero Long revision) {
	}

	public record Settlement(@NotNull UUID id, @NotNull UUID allocationId, @NotNull UUID paymentId,
	    @NotNull @Pattern(regexp = "[0-9]{1,15}") String amount) {
	}
}
