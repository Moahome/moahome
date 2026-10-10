package com.moahome.server.resident.dto;

import java.util.List;
import java.util.UUID;
import java.time.OffsetDateTime;

public record ResidentImportResponse(UUID importId, OffsetDateTime expiresAt, List<Row> rows) {
    public record Row(int rowNumber, String building, String unitNumber, String name, String relationType,
        String phoneLast4, String status, String reason, boolean representative) {
        @Override public String toString() { return "ResidentImportResponse.Row[REDACTED]"; }
    }
}
