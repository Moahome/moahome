package com.moahome.server.accounting.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record IncomeStatementResponse(UUID propertyId, String propertyName, OffsetDateTime generatedAt,
	Range range, Configuration configuration, boolean canManage, String completeness,
	List<Building> buildings, List<Account> accounts, List<Entry> records, List<Issue> issues,
	List<Expense> expenses, List<RevenueItem> revenueItems) {
	public record Range(String startMonth, String endMonth) {
	}

	public record Configuration(String startMonth, int fiscalYearStartMonth) {
	}

	public record Building(UUID id, String name) {
	}

	public record Account(UUID id, String name, String group, String systemKey) {
	}

	public record Entry(String id, UUID accountId, String accountName, String group, String month,
		UUID buildingId, String amount) {
	}

	public record Issue(String id, String code, String label, String amount, String path, UUID expenseId,
		UUID revenueItemId) {
		public Issue(String id, String code, String label, String amount, String path, UUID expenseId) {
			this(id, code, label, amount, path, expenseId, null);
		}
	}

	public record RevenueItem(UUID id, String name, String amount, boolean recognized, int revision) {
	}

	public record Expense(UUID id, UUID transactionId, LocalDate date, String name, String amount,
		UUID accountId, String recognitionMonth, int revision) {
	}
}
