package com.moahome.server.property.dto;

import java.util.List;
import java.util.UUID;
import jakarta.validation.constraints.*;

public record UnitDeleteRequest(@NotNull @Size(min = 1, max = 1000) List<@NotNull UUID> unitIds) {
}
