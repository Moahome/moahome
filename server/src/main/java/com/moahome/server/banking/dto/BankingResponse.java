package com.moahome.server.banking.dto;
import java.time.*;
import java.util.*;
public final class BankingResponse {
    private BankingResponse() {}
    public record Building(UUID id,String label) {}
    public record Unit(UUID id,String label) {}
    public record Allocation(UUID buildingId,String label,String amount,String percentage) {}
    public record Expense(UUID id,String category,String note,String mode,boolean saveAsRule,List<Allocation> allocations) {}
    public record Transaction(UUID id,UUID accountId,LocalDate date,LocalTime time,String payer,String memo,String amount,String balance,
        String direction,String ruleKey,UUID paymentId,String status,String unitId,String unitLabel,Expense expense,Expense incomeAllocation,String receiptType) {}
    public record Rule(String key,UUID accountId,String category,String mode,List<Allocation> allocations) {}
    public record Workspace(UUID propertyId,LocalDate asOf,List<Building> buildings,List<Unit> units,List<Transaction> rows,List<Rule> rules) {}
    public record Preview(UUID propertyId,List<Transaction> rows,int duplicateCount,int beforeCutoffCount) {}
}
