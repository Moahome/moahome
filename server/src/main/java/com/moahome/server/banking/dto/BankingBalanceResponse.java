package com.moahome.server.banking.dto;
import java.time.*;
import java.util.*;
public final class BankingBalanceResponse {
    private BankingBalanceResponse() {}
    public record Building(UUID id,String label,boolean active,String startBalance,String income,String expense,String balance,String status,String openingBalance,long openingRevision) {}
    public record Entry(UUID id,UUID buildingId,LocalDate date,LocalTime time,String label,String income,String expense,UUID paymentId,UUID accountId) {
        public Entry(UUID id,UUID buildingId,LocalDate date,LocalTime time,String label,String income,String expense,UUID paymentId) { this(id,buildingId,date,time,label,income,expense,paymentId,null); }
    }
    public record External(UUID id,String label,String expenseName,LocalDate date,String amount,String received,String remaining,List<Recovery> recoveries,boolean excluded,long decisionRevision,UUID accountId,UUID transactionId,String transactionAmount) {
        public External(UUID id,String label,String expenseName,LocalDate date,String amount,String received,String remaining,List<Recovery> recoveries,boolean excluded,long decisionRevision) { this(id,label,expenseName,date,amount,received,remaining,recoveries,excluded,decisionRevision,null,null,null); }
    }
    public record Recovery(UUID id,UUID paymentId,LocalDate date,String payer,String amount) {}
    public record Income(UUID id,UUID transactionId,LocalDate date,String payer,String amount,String available,String kind,UUID linkedBuildingId,String linkedUnitLabel,UUID accountId) {
        public Income(UUID id,UUID transactionId,LocalDate date,String payer,String amount,String available,String kind,UUID linkedBuildingId,String linkedUnitLabel) { this(id,transactionId,date,payer,amount,available,kind,linkedBuildingId,linkedUnitLabel,null); }
    }
    public record Pending(UUID id,LocalDate date,String label,String direction,String amount) {}
    public record LegacyOpening(LocalDate cutoffDate,List<LegacyOpeningPart> buildings) {}
    public record LegacyOpeningPart(UUID buildingId,String amount) {}
    public record Workspace(UUID propertyId,String month,LocalDate cutoffDate,String bankBalance,String bankAsOf,
        List<Building> buildings,List<Entry> entries,List<External> externals,List<Income> incomes,List<Pending> pending,List<AccountBalance> accounts,UUID accountId,LegacyOpening legacyOpening) {
        public Workspace(UUID propertyId,String month,LocalDate cutoffDate,String bankBalance,String bankAsOf,List<Building> buildings,List<Entry> entries,List<External> externals,List<Income> incomes,List<Pending> pending) {
            this(propertyId,month,cutoffDate,bankBalance,bankAsOf,buildings,entries,externals,incomes,pending,List.of(),null,null);
        }
    }
    public record AccountBalance(UUID id,String label,String status,String balance,String asOf,LocalDate openingDate,String openingBalance,long openingRevision,String calculatedBalance,LocalDate calculationBasisDate) {
        public AccountBalance(UUID id,String label,String status,String balance,String asOf,LocalDate openingDate,String openingBalance,long openingRevision) { this(id,label,status,balance,asOf,openingDate,openingBalance,openingRevision,null,null); }
        public AccountBalance(UUID id,String label,String status,String balance,String asOf) { this(id,label,status,balance,asOf,null,null,0,null,null); }
    }
}
