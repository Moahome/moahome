package com.moahome.server.billing.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(name="charge_items")
public class ChargeItem {
    @Id private UUID id;
    @Column(name="property_id", nullable=false) private UUID propertyId;
    @Column(name="charge_id", nullable=false) private UUID chargeId;
    @Column(name="source_template_item_id", nullable=false) private UUID sourceTemplateItemId;
    @Enumerated(EnumType.STRING) @Column(name="item_code", length=30) private FeeItemCode itemCode;
    @Column(name="item_name", nullable=false, length=100) private String itemName;
    @Column(nullable=false, precision=15, scale=0) private BigDecimal amount;
    @Column(name="revenue_account_id") private UUID revenueAccountId;
    @Column(name="sort_order", nullable=false) private int sortOrder;
    @Column(name="created_at", nullable=false, columnDefinition="timestamptz") private OffsetDateTime createdAt;
    @Column(name="updated_at", nullable=false, columnDefinition="timestamptz") private OffsetDateTime updatedAt;
    protected ChargeItem() {}

    /** 원본 템플릿의 이름·코드·금액·계정 연결을 복사해 확정 청구의 불변 스냅샷을 만듭니다. */
    public static ChargeItem snapshot(Charge charge, FeeTemplateItem source, OffsetDateTime at) {
        var item = new ChargeItem();
        item.id = UUID.randomUUID();
        item.propertyId = charge.getPropertyId();
        item.chargeId = charge.getId();
        item.sourceTemplateItemId = source.getId();
        item.itemCode = source.getItemCode();
        item.itemName = source.getItemName();
        item.amount = source.getDefaultAmount();
        item.revenueAccountId = source.getRevenueAccountId();
        item.sortOrder = source.getSortOrder();
        item.createdAt = at;
        item.updatedAt = at;
        return item;
    }
}
