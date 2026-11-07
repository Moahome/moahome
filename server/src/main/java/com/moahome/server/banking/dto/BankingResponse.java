package com.moahome.server.banking.dto;

import com.moahome.server.accounting.dto.ExpenseAccountOption;
import java.time.*;
import java.util.*;

public final class BankingResponse {
	private BankingResponse() {
	}

	public record Building(UUID id, String label) {
	}

	public record Unit(UUID id, String label, List<String> residentNames) {
		public Unit(UUID id, String label) {
			this(id, label, List.of());
		}
	}

	public record Allocation(UUID buildingId, String label, String amount, String percentage) {
	}

	public record Expense(UUID id, String category, String note, String mode, boolean saveAsRule,
	    List<Allocation> allocations, String accountCode, String accountName) {
		public Expense(UUID id, String category, String note, String mode, boolean saveAsRule, List<Allocation> allocations) {
			this(id, category, note, mode, saveAsRule, allocations, null, null);
		}
	}

	public record Transaction(UUID id, UUID accountId, LocalDate date, LocalTime time, String payer, String memo,
	    String amount, String balance, String direction, String ruleKey, UUID paymentId, String status, String unitId,
	    String unitLabel, Expense expense, Expense incomeAllocation, String receiptType, boolean transferCandidate,
	    UUID transferId, String sourceType, UUID transferAccountId, boolean automaticTransfer,
	    List<BankingRequests.TransferAllocation> transferAllocations) {
		public Transaction(UUID id, UUID accountId, LocalDate date, LocalTime time, String payer, String memo,
		    String amount, String balance, String direction, String ruleKey, UUID paymentId, String status, String unitId,
		    String unitLabel, Expense expense, Expense incomeAllocation, String receiptType, boolean transferCandidate,
		    UUID transferId, String sourceType, UUID transferAccountId, boolean automaticTransfer) {
			this(id, accountId, date, time, payer, memo, amount, balance, direction, ruleKey, paymentId, status, unitId,
			    unitLabel, expense, incomeAllocation, receiptType, transferCandidate, transferId, sourceType, transferAccountId, automaticTransfer, List.of());
		}
		public Transaction(UUID id, UUID accountId, LocalDate date, LocalTime time, String payer, String memo,
		    String amount, String balance, String direction, String ruleKey, UUID paymentId, String status,
		    String unitId, String unitLabel, Expense expense, Expense incomeAllocation, String receiptType,
		    boolean transferCandidate, UUID transferId, String sourceType) {
			this(id, accountId, date, time, payer, memo, amount, balance, direction, ruleKey, paymentId, status,
			    unitId, unitLabel, expense, incomeAllocation, receiptType, transferCandidate, transferId, sourceType, null, false);
		}

		public Transaction(UUID id, UUID accountId, LocalDate date, LocalTime time, String payer, String memo,
		    String amount, String balance, String direction, String ruleKey, UUID paymentId, String status,
		    String unitId, String unitLabel, Expense expense, Expense incomeAllocation, String receiptType,
		    boolean transferCandidate, UUID transferId) {
			this(id, accountId, date, time, payer, memo, amount, balance, direction, ruleKey, paymentId, status, unitId,
			    unitLabel, expense, incomeAllocation, receiptType, transferCandidate, transferId, "BANK_IMPORT");
		}

		public Transaction(UUID id, UUID accountId, LocalDate date, LocalTime time, String payer, String memo,
		    String amount, String balance, String direction, String ruleKey, UUID paymentId, String status,
		    String unitId, String unitLabel, Expense expense, Expense incomeAllocation, String receiptType) {
			this(id, accountId, date, time, payer, memo, amount, balance, direction, ruleKey, paymentId, status, unitId,
			    unitLabel, expense, incomeAllocation, receiptType, false, null);
		}
	}

	public record Rule(String key, UUID accountId, String category, String mode, List<Allocation> allocations, String accountCode) {
	}

	public record Workspace(UUID propertyId, LocalDate asOf, List<Building> buildings, List<Unit> units,
	    List<Transaction> rows, List<Rule> rules, List<Account> accounts,
	    List<ExpenseAccountOption> expenseAccounts, List<DeletionGroup> deletionGroups) {
		public Workspace(UUID propertyId, LocalDate asOf, List<Building> buildings, List<Unit> units,
		    List<Transaction> rows, List<Rule> rules, List<Account> accounts, List<ExpenseAccountOption> expenseAccounts) {
			this(propertyId, asOf, buildings, units, rows, rules, accounts, expenseAccounts, List.of());
		}
		public Workspace(UUID propertyId, LocalDate asOf, List<Building> buildings, List<Unit> units,
		    List<Transaction> rows, List<Rule> rules, List<Account> accounts) {
			this(propertyId, asOf, buildings, units, rows, rules, accounts, List.of());
		}
		public Workspace(UUID propertyId, LocalDate asOf, List<Building> buildings, List<Unit> units,
		    List<Transaction> rows, List<Rule> rules) {
			this(propertyId, asOf, buildings, units, rows, rules, List.of());
		}
	}

	public record DeletionGroup(UUID id, List<UUID> transactionIds, boolean requiresCancellation) {
	}

	public record Account(UUID id, String bankName, String last4, String alias, boolean isPrimary, String status,
	    String bankCode, ImportSupport importSupport, LocalDate availableFrom, LocalDate closedOn, boolean hasHistory) {
		public Account(UUID id, String bankName, String last4, String alias, boolean isPrimary, String status,
		    String bankCode, ImportSupport importSupport) {
			this(id, bankName, last4, alias, isPrimary, status, bankCode, importSupport, null, null, true);
		}
	}

	public record ImportSupport(boolean enabled, List<String> extensions, String message) {
	}

	public record Period(LocalDate from, LocalDate to) {
	}

	public record Preview(UUID propertyId, List<Transaction> rows, int duplicateCount, int beforeCutoffCount,
	    Period period) {
		public Preview(UUID propertyId, List<Transaction> rows, int duplicateCount, int beforeCutoffCount) {
			this(propertyId, rows, duplicateCount, beforeCutoffCount, null);
		}
	}
}
