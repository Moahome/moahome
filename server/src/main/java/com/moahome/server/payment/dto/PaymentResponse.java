package com.moahome.server.payment.dto;
import java.time.LocalDate;
import java.util.*;
public final class PaymentResponse {
    private PaymentResponse() {}
    public record Account(UUID id,String label) {}
    public record Unit(UUID id,String label,String status,boolean eligible,UUID representativeId,String representativeName) {}
    public record Charge(UUID id,UUID unitId,String month,String amount,String status,LocalDate dueDate) {}
    public record Allocation(UUID chargeId,String amount) {}
    public record Payment(UUID id,String source,String status,UUID accountId,LocalDate date,String payer,String amount,
        String unitId,String reason,List<Allocation> allocations,UUID linkedPaymentId,UUID bankTransactionId,
        String holdReason,String cancelReason,String separateReason,String memo) {}
    public record Ledger(UUID propertyId,LocalDate asOf,List<Account> accounts,List<Unit> units,List<Charge> charges,
        List<Payment> payments,List<Object> history) {}
    public record ImportPreview(UUID propertyId,List<Payment> rows,int duplicateCount) {}
}
