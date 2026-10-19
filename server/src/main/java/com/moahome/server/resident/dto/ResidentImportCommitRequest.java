package com.moahome.server.resident.dto;

import jakarta.validation.constraints.*;
import java.util.List;

public record ResidentImportCommitRequest(@NotEmpty @Size(max = 1000) List<@NotNull @Min(2) Integer> rowNumbers) {
}
