package com.moahome.server.banking.dto;
import java.time.*;
import java.util.*;
public final class BankingBalanceResponse {
    private BankingBalanceResponse() {}
    public record Building(UUID id,String label,boolean active,String startBalance,String income,String expense,String balance,String status,String openingBalance,long openingRevision) {}
    public record Entry(UUID id,UUID buildingId,LocalDate date,LocalTime time,String label,String income,String expense,UUID paymentId) {}
    public record External(UUID id,String label,String expenseName,LocalDate date,String amount,String received,String remaining,List<Recovery> recoveries,boolean excluded,long decisionRevision) {}
    public record Recovery(UUID id,UUID paymentId,LocalDate date,String payer,String amount) {}
    public record Income(UUID id,UUID transactionId,LocalDate date,String payer,String amount,String available,String kind,UUID linkedBuildingId,String linkedUnitLabel) {}
    public record Pending(UUID id,LocalDate date,String label,String direction,String amount) {}
    public record Workspace(UUID propertyId,String month,LocalDate cutoffDate,String bankBalance,String bankAsOf,
        List<Building> buildings,List<Entry> entries,List<External> externals,List<Income> incomes,List<Pending> pending) {}
}
