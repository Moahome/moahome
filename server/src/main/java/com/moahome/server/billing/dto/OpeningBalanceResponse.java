package com.moahome.server.billing.dto;
import java.time.*;
import java.util.*;

public record OpeningBalanceResponse(UUID propertyId, LocalDate asOf, boolean managementStarted,
    LocalDate cutoffDate, String firstBillingMonth, Batch batch, List<Unit> units, List<Account> accounts, List<Batch> history) {
    public record Batch(UUID id, long revision, String status, LocalDate cutoffDate, String firstBillingMonth,
        OffsetDateTime confirmedAt, OffsetDateTime canceledAt, String cancelReason) {}
    public record Unit(UUID unitId, String label, String receivable, String credit, String originMonth, String responsibility) {}
    public record Account(UUID accountId, String label, String amount) {}
}

