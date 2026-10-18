package com.moahome.server.billing.domain;
import java.math.BigDecimal;
import java.util.*;
import java.time.*;
import jakarta.persistence.*;
import lombok.Getter;
@Getter @Entity @Table(name="bank_opening_balances")
public class BankOpeningBalance {
    @Id private UUID id;
    @Column(name="property_id",nullable=false) private UUID propertyId;
    @Column(name="batch_id") private UUID batchId;
    @Column(name="bank_account_id",nullable=false) private UUID bankAccountId;
    @Column(nullable=false,precision=15,scale=0) private BigDecimal amount;
    @Column(name="cutoff_date",nullable=false) private LocalDate cutoffDate;
    @Column(nullable=false) private long revision;
    @Column(name="recorded_by",nullable=false) private UUID recordedBy;
    @Column(name="recorded_at",nullable=false,columnDefinition="timestamptz") private OffsetDateTime recordedAt;
    protected BankOpeningBalance() {}
    /** 통장 기준일 잔액은 세대 미납·선납과 합산하지 않고 계좌별로 인계합니다. */
    public static BankOpeningBalance create(OpeningBalanceBatch batch, UUID account, BigDecimal amount) {
        OpeningBalanceItem.requireAmount(amount);
        var row=new BankOpeningBalance();row.id=UUID.randomUUID();row.propertyId=batch.getPropertyId();row.batchId=batch.getId();
        row.bankAccountId=account;row.amount=amount;row.cutoffDate=batch.getCutoffDate();row.recordedBy=batch.getCreatedBy();row.recordedAt=batch.getCreatedAt();return row;
    }    /** 운영 중 통장별 기준 잔액은 인계 batch를 생성하지 않고 독립 버전으로 보존합니다. */
    public static BankOpeningBalance independent(UUID id,UUID property,UUID account,LocalDate cutoff,BigDecimal amount,long revision,UUID actor,OffsetDateTime at) {
        OpeningBalanceItem.requireAmount(amount);
        if(revision<=0) throw new IllegalArgumentException("Invalid bank opening revision");
        var row=new BankOpeningBalance();row.id=id;row.propertyId=property;row.bankAccountId=account;
        row.cutoffDate=Objects.requireNonNull(cutoff);row.amount=amount;row.revision=revision;
        row.recordedBy=Objects.requireNonNull(actor);row.recordedAt=Objects.requireNonNull(at);return row;
    }

}

