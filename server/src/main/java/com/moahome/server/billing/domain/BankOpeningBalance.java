package com.moahome.server.billing.domain;
import java.math.BigDecimal;
import java.util.*;
import jakarta.persistence.*;
import lombok.Getter;
@Getter @Entity @Table(name="bank_opening_balances")
public class BankOpeningBalance {
    @Id private UUID id;
    @Column(name="property_id",nullable=false) private UUID propertyId;
    @Column(name="batch_id",nullable=false) private UUID batchId;
    @Column(name="bank_account_id",nullable=false) private UUID bankAccountId;
    @Column(nullable=false,precision=15,scale=0) private BigDecimal amount;
    protected BankOpeningBalance() {}
    /** 통장 기준일 잔액은 세대 미납·선납과 합산하지 않고 계좌별로 인계합니다. */
    public static BankOpeningBalance create(OpeningBalanceBatch batch, UUID account, BigDecimal amount) {
        OpeningBalanceItem.requireAmount(amount);
        var row=new BankOpeningBalance();row.id=UUID.randomUUID();row.propertyId=batch.getPropertyId();row.batchId=batch.getId();
        row.bankAccountId=account;row.amount=amount;return row;
    }
}

