package com.moahome.server.banking.domain;

import java.math.BigDecimal;
import java.time.*;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;
import com.moahome.server.payment.exception.PaymentException;

@Getter @Entity @Table(name="building_cash_openings")
public class BuildingCashOpening {
    @Id private UUID id;
    @Column(name="property_id",nullable=false) private UUID propertyId;
    @Column(name="building_id",nullable=false) private UUID buildingId;
    @Column(name="cutoff_date",nullable=false) private LocalDate cutoffDate;
    @Column(nullable=false,precision=15,scale=0) private BigDecimal amount;
    @Column(name="created_by",nullable=false) private UUID createdBy;
    @Column(name="created_at",nullable=false,columnDefinition="timestamptz") private OffsetDateTime createdAt;
    @Column(nullable=false) private long revision;
    @Column(name="correction_request_id") private UUID correctionRequestId;
    @Column(name="updated_by") private UUID updatedBy;
    @Column(name="updated_at",columnDefinition="timestamptz") private OffsetDateTime updatedAt;
    protected BuildingCashOpening() {}
    /** 기준일 마감 보유금을 최초 등록하며 음수도 보존해 부족한 동의 잔고를 숨기지 않습니다. */
    public static BuildingCashOpening create(UUID property,UUID building,LocalDate cutoff,String amount,UUID actor,OffsetDateTime at) {
        if(amount==null||!amount.matches("-?[0-9]{1,15}")) throw new PaymentException("INVALID_CASH_OPENING");
        var row=new BuildingCashOpening();row.id=UUID.randomUUID();row.propertyId=property;row.buildingId=building;
        row.cutoffDate=cutoff;row.amount=new BigDecimal(amount);row.createdBy=actor;row.createdAt=at;return row;
    }
    /** 사용자가 확인한 새 기준일·마감 잔고를 함께 반영하고 DB가 이전 값과 수정자를 이력에 보관하게 합니다. */
    public void correct(LocalDate cutoff,String amount,UUID request,UUID actor,OffsetDateTime at) {
        if(amount==null||!amount.matches("-?[0-9]{1,15}")) throw new PaymentException("INVALID_CASH_OPENING");
        this.cutoffDate=cutoff;this.amount=new BigDecimal(amount);this.correctionRequestId=request;
        this.updatedBy=actor;this.updatedAt=at;this.revision++;
    }

}
