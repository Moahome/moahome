package com.moahome.server.banking.domain;

import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;

@Getter @Entity @Table(name="bank_transfers")
public class BankTransfer {
    @Id private UUID id;
    @Column(name="property_id",nullable=false) private UUID propertyId;
    @Column(name="outgoing_id",nullable=false) private UUID outgoingId;
    @Column(name="incoming_id",nullable=false) private UUID incomingId;
    @Column(name="created_by",nullable=false) private UUID createdBy;
    @Column(name="created_at",nullable=false,columnDefinition="timestamptz") private OffsetDateTime createdAt;
    @Column(name="canceled_by") private UUID canceledBy;
    @Column(name="canceled_at",columnDefinition="timestamptz") private OffsetDateTime canceledAt;
    protected BankTransfer() {}

    /** 두 은행 원본을 연결하며 원본 입출금·잔액과 동별 보유금은 변경하지 않습니다. */
    public static BankTransfer connect(UUID id, UUID property, UUID outgoing, UUID incoming, UUID actor, OffsetDateTime at) {
        var transfer=new BankTransfer();
        transfer.id=id;transfer.propertyId=property;transfer.outgoingId=outgoing;transfer.incomingId=incoming;
        transfer.createdBy=actor;transfer.createdAt=at;
        return transfer;
    }
    /** 연결 정정은 취소 이력을 남기며 원본을 다시 연결 대기로 돌립니다. */
    public void cancel(UUID actor,OffsetDateTime at) {
        if(canceledAt!=null) return;
        canceledBy=actor;canceledAt=at;
    }
}
