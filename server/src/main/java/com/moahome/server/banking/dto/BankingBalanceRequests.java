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
	    @NotNull @PositiveOrZero Long revision, @NotBlank @Size(max = 500) String reason,
	    String billingToken, boolean confirmBilling, List<@NotNull @Valid OpeningCorrectionPart> buildings) {
		public AccountOpening(UUID id, UUID accountId, LocalDate cutoffDate, String amount, Long revision, String reason) {
			this(id, accountId, cutoffDate, amount, revision, reason, null, false, null);
		}
		public AccountOpening(UUID id, UUID accountId, LocalDate cutoffDate, String amount, Long revision) {
			this(id, accountId, cutoffDate, amount, revision, "초기 통장 기준 정정");
		}
	}

	public record Opening(@NotNull LocalDate cutoffDate,
	    @NotEmpty @Size(max = 1000) List<@NotNull @Valid OpeningPart> buildings, UUID accountId) {
		public Opening(LocalDate cutoffDate, List<OpeningPart> buildings) {
			this(cutoffDate, buildings, null);
		}
	}

	public record OpeningCorrection(@NotNull UUID id, @NotNull LocalDate cutoffDate,
	    @NotEmpty @Size(max = 1000) List<@NotNull @Valid OpeningCorrectionPart> buildings, UUID accountId,
	    @NotBlank @Size(max = 500) String reason) {
		public OpeningCorrection(UUID id, LocalDate cutoffDate, List<OpeningCorrectionPart> buildings, UUID accountId) {
			this(id, cutoffDate, buildings, accountId, "초기 동별 기준 정정");
		}
		public OpeningCorrection(UUID id, LocalDate cutoffDate, List<OpeningCorrectionPart> buildings) {
			this(id, cutoffDate, buildings, null, "초기 동별 기준 정정");
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
