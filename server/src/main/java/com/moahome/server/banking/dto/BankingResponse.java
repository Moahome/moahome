package com.moahome.server.banking.dto;

import java.time.*;
import java.util.*;

public final class BankingResponse {
	private BankingResponse() {
	}

	public record Building(UUID id, String label) {
	}

	public record Unit(UUID id, String label) {
	}

	public record Allocation(UUID buildingId, String label, String amount, String percentage) {
	}

	public record Expense(UUID id, String category, String note, String mode, boolean saveAsRule,
	    List<Allocation> allocations) {
	}

	public record Transaction(UUID id, UUID accountId, LocalDate date, LocalTime time, String payer, String memo,
	    String amount, String balance, String direction, String ruleKey, UUID paymentId, String status, String unitId,
	    String unitLabel, Expense expense, Expense incomeAllocation, String receiptType, boolean transferCandidate,
	    UUID transferId, String sourceType) {
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

	public record Rule(String key, UUID accountId, String category, String mode, List<Allocation> allocations) {
	}

	public record Workspace(UUID propertyId, LocalDate asOf, List<Building> buildings, List<Unit> units,
	    List<Transaction> rows, List<Rule> rules, List<Account> accounts) {
		public Workspace(UUID propertyId, LocalDate asOf, List<Building> buildings, List<Unit> units,
		    List<Transaction> rows, List<Rule> rules) {
			this(propertyId, asOf, buildings, units, rows, rules, List.of());
		}
	}

	public record Account(UUID id, String bankName, String last4, String alias, boolean isPrimary, String status,
	    LocalDate availableFrom, LocalDate closedOn, boolean hasHistory) {
		public Account(UUID id, String bankName, String last4, String alias, boolean isPrimary, String status) {
			this(id, bankName, last4, alias, isPrimary, status, null, null, true);
		}
	}

	public record Preview(UUID propertyId, List<Transaction> rows, int duplicateCount, int beforeCutoffCount) {
	}
}
