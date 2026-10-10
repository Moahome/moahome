package com.moahome.server.resident.repo;

import com.moahome.server.resident.domain.ResidentImportBatch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

public interface ResidentImportBatchRepository extends JpaRepository<ResidentImportBatch, UUID> {
    Optional<ResidentImportBatch> findByIdAndPropertyIdAndCreatedBy(UUID id, UUID propertyId, UUID createdBy);
    @Modifying
    @Query("delete from ResidentImportBatch batch where batch.expiresAt <= :at")
    int deleteExpired(OffsetDateTime at);
}
