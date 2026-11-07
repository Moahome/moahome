package com.moahome.server.expense.dto;

import java.time.LocalDate;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

public final class PayableResponse {
	private PayableResponse() {
	}

	@Schema(name = "PayableAccount")
	public record Account(UUID id, String code, String name, boolean active) {
		public Account(UUID id, String code, String name) {
			this(id, code, name, true);
		}
	}

	@Schema(name = "PayableBuilding")
	public record Building(UUID id, String name, boolean active) {
	}

	@Schema(name = "PayableSettlement")
	public record Settlement(UUID id, UUID expenseId, LocalDate date, String amount, String status, String path) {
	}

	@Schema(name = "PayableItem")
	public record Item(UUID id, LocalDate date, String name, String counterparty, String memo, UUID accountId,
		UUID payableAccountId, UUID buildingId, String amount, String paid, String remaining, String status,
		List<Settlement> payments) {
	}

	@Schema(name = "PayableCandidate")
	public record Candidate(UUID expenseId, LocalDate date, String name, String amount, UUID accountId,
		UUID buildingId, String path) {
	}

	@Schema(name = "PayableWorkspace")
	public record Workspace(UUID propertyId, boolean hasBuildings, boolean canManage, List<Account> accounts,
		List<Building> buildings, List<Item> items, List<Candidate> candidates) {
	}
}
