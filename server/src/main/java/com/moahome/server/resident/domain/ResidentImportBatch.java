package com.moahome.server.resident.domain;

import jakarta.persistence.*;
import lombok.Getter;
import java.time.OffsetDateTime;
import java.util.UUID;

@Getter
@Entity
@Table(name = "resident_import_batches")
public class ResidentImportBatch {
    @Id private UUID id;
    @Column(name = "property_id", nullable = false, updatable = false) private UUID propertyId;
    @Column(name = "created_by", nullable = false, updatable = false) private UUID createdBy;
    @Column(name = "rows_payload", nullable = false, updatable = false, columnDefinition = "text") private String rowsPayload;
    @Column(name = "created_at", nullable = false, updatable = false) private OffsetDateTime createdAt;
    @Column(name = "expires_at", nullable = false, updatable = false) private OffsetDateTime expiresAt;
    protected ResidentImportBatch() {}

    /** 정규화·암호화된 검증 결과를 작성자와 관리대상에 묶고 하루 후 만료되도록 저장합니다. */
    public static ResidentImportBatch create(UUID propertyId, UUID actorId, String payload, OffsetDateTime at) {
        var batch = new ResidentImportBatch();
        batch.id = UUID.randomUUID();
        batch.propertyId = java.util.Objects.requireNonNull(propertyId);
        batch.createdBy = java.util.Objects.requireNonNull(actorId);
        batch.rowsPayload = java.util.Objects.requireNonNull(payload);
        batch.createdAt = at;
        batch.expiresAt = at.plusDays(1);
        return batch;
    }
}
