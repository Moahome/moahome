package com.moahome.server.dashboard.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import com.moahome.server.banking.dto.BankingBalanceResponse;
import com.moahome.server.banking.dto.BankingResponse;
import com.moahome.server.payment.dto.PaymentResponse;

public record DashboardResponse(UUID propertyId, String propertyName, String month, LocalDate businessDate,
	OffsetDateTime generatedAt, BankingResponse.Workspace banking, BankingBalanceResponse.Workspace balances,
	PaymentResponse.Ledger payments, Tasks tasks) {

	public record Tasks(long income, long expenses, long joinRequests, long invitationChanges, long external,
		long duplicates) {
	}
}
