package com.moahome.server.payment.dto;

import java.time.LocalDate;
import java.util.*;

public final class PaymentResponse {
	private PaymentResponse() {
	}

	public record Account(UUID id, String label, boolean isPrimary, String status) {
		public Account(UUID id, String label) {
			this(id, label, false, "ACTIVE");
		}
	}

	public record Unit(UUID id, String label, String status, boolean eligible, UUID representativeId,
	    String representativeName, List<String> residentNames, String buildingName) {
	}

	public record Charge(UUID id, UUID unitId, String month, String amount, String status, LocalDate dueDate,
	    String chargeType) {
		public Charge(UUID id, UUID unitId, String month, String amount, String status, LocalDate dueDate) {
			this(id, unitId, month, amount, status, dueDate, "MONTHLY");
		}
	}

	public record Building(UUID id, String label) {
	}

	public record OpeningCredit(UUID id, UUID unitId, LocalDate date, String amount, List<Allocation> allocations) {
	}

	public record Allocation(UUID chargeId, String amount) {
	}

	public record Payment(UUID id, String source, String status, UUID accountId, LocalDate date, String payer,
	    String amount, String unitId, String reason, List<Allocation> allocations, UUID linkedPaymentId,
	    UUID bankTransactionId, String holdReason, String cancelReason, String separateReason, String memo,
	    String receiptType, String incomeCategory, String incomeNote,
	    com.moahome.server.banking.dto.BankingResponse.Expense incomeAllocation) {
		public Payment(UUID id, String source, String status, UUID accountId, LocalDate date, String payer,
		    String amount, String unitId, String reason, List<Allocation> allocations, UUID linkedPaymentId,
		    UUID bankTransactionId, String holdReason, String cancelReason, String separateReason, String memo,
		    String receiptType, String incomeCategory, String incomeNote) {
			this(id, source, status, accountId, date, payer, amount, unitId, reason, allocations, linkedPaymentId,
			    bankTransactionId, holdReason, cancelReason, separateReason, memo, receiptType, incomeCategory,
			    incomeNote, null);
		}
	}

	public record Ledger(UUID propertyId, LocalDate asOf, List<Account> accounts, List<Unit> units,
	    List<Charge> charges, List<Payment> payments, List<Object> history, List<OpeningCredit> openingCredits,
	    List<Building> buildings) {
		public Ledger(UUID propertyId, LocalDate asOf, List<Account> accounts, List<Unit> units, List<Charge> charges,
		    List<Payment> payments, List<Object> history) {
			this(propertyId, asOf, accounts, units, charges, payments, history, List.of(), List.of());
		}
	}

	public record ImportPreview(UUID propertyId, List<Payment> rows, int duplicateCount) {
	}
}
