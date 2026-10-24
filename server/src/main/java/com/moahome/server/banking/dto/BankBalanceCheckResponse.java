package com.moahome.server.banking.dto;

import java.time.OffsetDateTime;
import java.util.*;

public record BankBalanceCheckResponse(UUID propertyId, UUID accountId, List<Item> checks) {
	public record Item(UUID id, String amount, OffsetDateTime checkedAt, String sourceType, UUID checkedBy,
	    String checkedByName, String memo, OffsetDateTime createdAt, OffsetDateTime canceledAt, UUID canceledBy,
	    String canceledByName, String cancelReason) {
		@Override
		public String toString() {
			return "BalanceCheckItem[REDACTED]";
		}
	}
}
