package com.moahome.server.resident.dto;

import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.validation.constraints.NotNull;

/** 조회한 세대와 기존 대표를 함께 보내 다른 관리자의 대표 변경을 덮어쓰지 않습니다. */
public record ResidentRepresentativeRequest(@NotNull UUID unitId, UUID expectedRepresentativeResidentId,
    @NotNull OffsetDateTime expectedUpdatedAt) {
}
