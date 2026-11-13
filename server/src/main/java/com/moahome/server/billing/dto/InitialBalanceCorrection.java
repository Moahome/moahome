package com.moahome.server.billing.dto;

import java.time.*;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

/** 초기 통장 기준 정정은 세대 미수·선납이나 실제 거래를 수정하지 않습니다. */
public final class InitialBalanceCorrection {
	private InitialBalanceCorrection() {}

	public record Input(@NotNull UUID id, @NotNull @PositiveOrZero Long revision,
	    @NotNull LocalDate cutoffDate, @NotBlank @Size(max = 500) String reason,
	    @NotNull @Size(max = 1000) List<@NotNull @Valid Account> accounts,
	    String billingToken, boolean confirmBilling) {
		public Input(UUID id, Long revision, LocalDate cutoffDate, String reason, List<Account> accounts) {
			this(id, revision, cutoffDate, reason, accounts, null, false);
		}
	}

	public record Request(UUID batchId, Input input) {}

	public record Account(@NotNull UUID accountId,
	    @NotNull @Pattern(regexp = "[0-9]{1,15}") String amount) {}

	public record Detail(UUID targetId, String label, LocalDate previousDate, LocalDate newDate,
	    String previousAmount, String newAmount, String previousBillingMonth, String newBillingMonth,
	    List<String> generatedMonths) {
		public Detail(UUID targetId, String label, LocalDate previousDate, LocalDate newDate,
		    String previousAmount, String newAmount) {
			this(targetId, label, previousDate, newDate, previousAmount, newAmount, null, null, null);
		}
	}

	public record History(UUID id, String kind, UUID bankAccountId, LocalDate previousDate, LocalDate newDate,
	    List<Detail> details, String reason, UUID changedBy, String changedByName, OffsetDateTime changedAt) {}
}
