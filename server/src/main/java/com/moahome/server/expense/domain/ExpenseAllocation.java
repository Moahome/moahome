package com.moahome.server.expense.domain;

import java.math.BigDecimal;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;

@Getter @Entity @Table(name="expense_allocations")
public class ExpenseAllocation {
    @Id private UUID id;
    @Column(name="property_id",nullable=false) private UUID propertyId;
    @Column(name="expense_id",nullable=false) private UUID expenseId;
    @Column(name="building_id") private UUID buildingId;
    @Column(name="target_label_encrypted",nullable=false,columnDefinition="text") private String targetLabelEncrypted;
    @Column(name="allocated_amount",nullable=false,precision=15,scale=0) private BigDecimal allocatedAmount;
    @Column(precision=5,scale=2) private BigDecimal percentage;
    @Column(name="sort_order",nullable=false) private int sortOrder;
    protected ExpenseAllocation() {}
    public static ExpenseAllocation create(UUID property,UUID expense,UUID building,String label,BigDecimal amount,BigDecimal percentage,int order) {
        var a=new ExpenseAllocation();a.id=UUID.randomUUID();a.propertyId=property;a.expenseId=expense;a.buildingId=building;
        a.targetLabelEncrypted=label;a.allocatedAmount=amount;a.percentage=percentage;a.sortOrder=order;return a;
    }
}
