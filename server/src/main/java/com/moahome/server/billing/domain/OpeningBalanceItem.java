package com.moahome.server.billing.domain;

import java.math.BigDecimal;
import java.util.*;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(name="opening_balance_items")
public class OpeningBalanceItem {
    @Id private UUID id;
    @Column(name="property_id",nullable=false) private UUID propertyId;
    @Column(name="batch_id",nullable=false) private UUID batchId;
    @Column(name="unit_id",nullable=false) private UUID unitId;
    @Column(nullable=false,precision=15,scale=0) private BigDecimal receivable;
    @Column(nullable=false,precision=15,scale=0) private BigDecimal credit;
    @Column(name="charge_id") private UUID chargeId;
    @Column(name="origin_month",length=7) private String originMonth;
    @Column(name="responsibility_encrypted") private String responsibilityEncrypted;
    protected OpeningBalanceItem() {}
    /** 기존 미납·선납은 별개 금액으로 보존하고 부담 주체는 선택적인 암호화 메모로만 기록합니다. */
    public static OpeningBalanceItem create(OpeningBalanceBatch batch, UUID unit, BigDecimal receivable, BigDecimal credit,
        String originMonth, String responsibilityEncrypted) {
        requireAmount(receivable);requireAmount(credit);
        var item=new OpeningBalanceItem();item.id=UUID.randomUUID();item.propertyId=batch.getPropertyId();item.batchId=batch.getId();
        item.unitId=unit;item.receivable=receivable;item.credit=credit;item.originMonth=originMonth;item.responsibilityEncrypted=responsibilityEncrypted;
        return item;
    }
    public void connectReceivable(Charge charge) {
        if (!propertyId.equals(charge.getPropertyId()) || !unitId.equals(charge.getUnitId()) || chargeId!=null) throw new IllegalArgumentException("Invalid opening charge");
        chargeId=charge.getId();
    }
    public static void requireAmount(BigDecimal amount) {
        if(amount==null || amount.scale()!=0 || amount.signum()<0 || amount.compareTo(BigDecimal.valueOf(999_999_999_999_999L))>0)
            throw new IllegalArgumentException("Invalid opening amount");
    }
}

