package com.moahome.server.membership.domain;

import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** 이미 저장된 가입 신청의 확인된 주민 연결·연락처·대기 취소만 관리합니다. 신청·승인 API를 추가하지 않습니다. */
@Getter
@Entity
@Table(name = "membership_requests")
public class MembershipRequest {
    @Id private UUID id;
    @Column(name = "property_id") private UUID propertyId;
    @Column(name = "unit_id") private UUID unitId;
    @Column(name = "user_id") private UUID userId;
    @Column(name = "matched_resident_id") private UUID matchedResidentId;
    @Column(name = "request_phone_encrypted", columnDefinition = "text") private String phoneEncrypted;
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "request_phone_hmac", columnDefinition = "char(64)") private String phoneHmac;
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "request_phone_last4", columnDefinition = "char(4)") private String phoneLast4;
    @Column(name = "match_status") private String matchStatus;
    @Column private String status;
    @Column(name = "updated_at", columnDefinition = "timestamptz") private OffsetDateTime updatedAt;
    @Column(name = "deleted_at", columnDefinition = "timestamptz") private OffsetDateTime deletedAt;

    protected MembershipRequest() { }

    /** 관리소장이 변경한 현재 연락처를 확인된 신청에 함께 반영하며 미확인 사람의 신청을 전화번호로 추측하지 않습니다. */
    public void changePhone(String encrypted, String hmac, String last4, OffsetDateTime at) {
        if (encrypted == null || hmac == null || last4 == null) throw new IllegalArgumentException("Request contact required");
        phoneEncrypted = encrypted;
        phoneHmac = hmac;
        phoneLast4 = last4;
        updatedAt = at;
    }

    /** 삭제한 주민의 대기 신청이 나중에 승인되어 권한을 다시 부여하지 않도록 현재 대기를 취소합니다. */
    public void cancelPending(OffsetDateTime at) {
        if (!"PENDING".equals(status)) return;
        status = "CANCELED";
        updatedAt = at;
    }
}
