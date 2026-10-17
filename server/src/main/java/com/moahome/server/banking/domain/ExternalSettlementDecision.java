package com.moahome.server.banking.domain;

import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(name="external_settlement_decisions")
public class ExternalSettlementDecision {
    @Id private UUID id;
    @Column(name="property_id",nullable=false) private UUID propertyId;
    @Column(name="allocation_id",nullable=false) private UUID allocationId;
    @Column(nullable=false) private boolean excluded;
    @Column(nullable=false) private long revision;
    @Column(name="created_by",nullable=false) private UUID createdBy;
    @Column(name="created_at",nullable=false,columnDefinition="timestamptz") private OffsetDateTime createdAt;
    protected ExternalSettlementDecision() {}

    /** 정산 제외·복원을 새 이력으로 남겨 원본 지출·입금과 과거 회수 기록을 보존합니다. */
    public static ExternalSettlementDecision create(UUID id,UUID property,UUID allocation,boolean excluded,long revision,UUID actor,OffsetDateTime at) {
        var row=new ExternalSettlementDecision();row.id=id;row.propertyId=property;row.allocationId=allocation;
        row.excluded=excluded;row.revision=revision;row.createdBy=actor;row.createdAt=at;return row;
    }
}
