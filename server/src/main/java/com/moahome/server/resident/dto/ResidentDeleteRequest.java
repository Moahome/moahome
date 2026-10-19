package com.moahome.server.resident.dto;

import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.validation.constraints.NotNull;

public record ResidentDeleteRequest(UUID replacementResidentId, @NotNull OffsetDateTime expectedUpdatedAt) {
}
