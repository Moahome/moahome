package com.moahome.server.closing.dto;

import java.time.OffsetDateTime;
import java.util.UUID;
import com.moahome.server.banking.dto.BankingBalanceResponse;
import com.moahome.server.banking.dto.BankingResponse;
import com.moahome.server.payment.dto.PaymentResponse;

public record MonthlySettlementResponse(UUID propertyId, String month, OffsetDateTime generatedAt,
	BankingResponse.Workspace banking, BankingBalanceResponse.Workspace balances, PaymentResponse.Ledger payments) {
}
