package com.moahome.server.billing.dto;

import java.time.LocalDate;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

public record OpeningBalanceRequest(UUID batchId, Long revision, @NotNull LocalDate cutoffDate,
    @NotBlank String firstBillingMonth, @NotNull @Size(max = 10000) List<@Valid UnitInput> units,
    @NotNull @Size(max = 100) List<@Valid AccountInput> accounts) {
	public record UnitInput(@NotNull UUID unitId, @NotBlank @Pattern(regexp = "[0-9]{1,15}") String receivable,
	    @NotBlank @Pattern(regexp = "[0-9]{1,15}") String credit, String originMonth,
	    @Size(max = 500) String responsibility) {
	}

	public record AccountInput(@NotNull UUID accountId, @NotBlank @Pattern(regexp = "[0-9]{1,15}") String amount) {
	}

	public record Version(@NotNull Long revision) {
	}

	public record Cancel(@NotNull Long revision, @NotBlank @Size(max = 500) String reason) {
	}
}
