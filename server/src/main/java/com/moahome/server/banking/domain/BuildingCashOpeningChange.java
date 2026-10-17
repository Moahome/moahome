package com.moahome.server.banking.domain;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;

/** DB가 남긴 정정 이력을 읽어 같은 요청의 재시도를 식별합니다. 이력은 수정·삭제하지 않습니다. */
@Getter @Entity @Table(name="building_cash_opening_changes")
public class BuildingCashOpeningChange {
    @Id private UUID id;
    @Column(name="property_id",nullable=false) private UUID propertyId;
    @Column(name="building_id",nullable=false) private UUID buildingId;
    @Column(name="request_id",nullable=false) private UUID requestId;
    @Column(name="previous_revision",nullable=false) private long previousRevision;
    @Column(name="new_cutoff_date",nullable=false) private LocalDate newCutoffDate;
    @Column(name="new_amount",nullable=false,precision=15,scale=0) private BigDecimal newAmount;
    protected BuildingCashOpeningChange() {}
}
