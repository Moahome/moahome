package com.moahome.server.accounting.dto;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import io.swagger.v3.oas.annotations.media.Schema;

public record IncomeStatementResponse(UUID propertyId, String propertyName, OffsetDateTime generatedAt,
	Range range, Configuration configuration, boolean canManage, String completeness,
	List<Building> buildings, List<Account> accounts, List<Entry> records, List<Issue> issues,
	List<Expense> expenses, List<RevenueItem> revenueItems, List<Receivable> receivables, List<OtherIncome> otherIncomes,
	List<Household> households) {
	public IncomeStatementResponse(UUID propertyId, String propertyName, OffsetDateTime generatedAt,
		Range range, Configuration configuration, boolean canManage, String completeness,
		List<Building> buildings, List<Account> accounts, List<Entry> records, List<Issue> issues,
		List<Expense> expenses, List<RevenueItem> revenueItems, List<Receivable> receivables, List<OtherIncome> otherIncomes) {
		this(propertyId, propertyName, generatedAt, range, configuration, canManage, completeness, buildings,
			accounts, records, issues, expenses, revenueItems, receivables, otherIncomes, List.of());
	}

	public record Household(UUID unitId, String label, UUID receivableAccountId, UUID advanceAccountId,
		String receivable, String advance, String path) {
	}
	public record Range(String startMonth, String endMonth) {
	}

	public record Configuration(String startMonth, int fiscalYearStartMonth) {
	}

	public record Building(UUID id, String name, boolean deleted) {
	}

	public record Account(UUID id, String code, String name, String group, String systemKey, boolean active) {
		public Account(UUID id, String code, String name, String group, String systemKey) {
			this(id, code, name, group, systemKey, true);
		}
	}

	@Schema(name = "IncomeStatementEntry")
	public record Entry(String id, UUID accountId, String accountName, String group, String month,
		UUID buildingId, String amount, Source source) {
		public Entry(String id, UUID accountId, String accountName, String group, String month,
			UUID buildingId, String amount) {
			this(id, accountId, accountName, group, month, buildingId, amount, null);
		}
	}

	/** 부과월과 실제 거래일을 구분하고 기존 업무 상세로 되돌아갈 식별자를 보존합니다. */
	@Schema(name = "AccountingSource")
	public record Source(String kind, UUID id, LocalDate date, LocalTime time, String name, String context, String path) {
	}

	public record Issue(String id, String code, String label, String amount, String path, UUID expenseId,
		UUID revenueItemId, String sourceName, String sourceContext) {
	}

	public record RevenueItem(UUID id, String name, String amount, boolean recognized, int revision, String sourceContext) {
	}

	public record Receivable(UUID id, String accountCode, String name, LocalDate date, String counterparty,
		String amount, String received, String remaining, String path) {
	}

	public record OtherIncome(UUID id, UUID transactionId, LocalDate date, String name, String amount, UUID accountId) {
	}

	public record Expense(UUID id, UUID transactionId, LocalDate date, String name, String amount,
		UUID accountId, String recognitionMonth, int revision, List<TransferCandidate> transferCandidates, UUID transferPaymentId) {
		public Expense(UUID id, UUID transactionId, LocalDate date, String name, String amount,
			UUID accountId, String recognitionMonth, int revision) {
			this(id, transactionId, date, name, amount, accountId, recognitionMonth, revision, List.of(), null);
		}
	}

	public record TransferCandidate(UUID paymentId, String accountName, String name, LocalDate date, String amount) {
	}
}
