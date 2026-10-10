package com.moahome.server.property.dto;

import java.util.List;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

public record UnitBatchRequest(@NotNull @Size(min = 1, max = 1000) List<@NotNull @Valid UnitRequest> units) {
}
