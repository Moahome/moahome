package com.moahome.server.property.dto;

import java.time.LocalDate;
import java.util.List;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

/** 등록 전 임시 동 참조와 호수·계좌 배열 위치를 사용하고 실제 ID는 서버에서 연결합니다. */
public record RegistrationOpeningInput(
    @NotNull(message="REQUIRED") LocalDate cutoffDate,
    @NotNull(message="REQUIRED") @Pattern(regexp="[0-9]{4}-(0[1-9]|1[0-2])",message="INVALID_FORMAT") String firstBillingMonth,
    @NotNull(message="REQUIRED") @Size(max=10000) List<@NotNull @Valid UnitOpening> units,
    @NotNull(message="REQUIRED") @Size(max=100) List<@NotNull @Valid AccountOpening> accounts,
    LocalDate cashCutoffDate,
    @NotNull(message="REQUIRED") @Size(max=1000) List<@NotNull @Valid BuildingOpening> buildings
) {
    public record UnitOpening(
        @Pattern(regexp="[A-Za-z0-9_-]{1,50}",message="INVALID_FORMAT") String buildingClientId,
        @NotBlank(message="REQUIRED") String unitNumber,
        @NotNull(message="REQUIRED") @Pattern(regexp="[0-9]{1,15}",message="INVALID_FORMAT") String receivable,
        @NotNull(message="REQUIRED") @Pattern(regexp="[0-9]{1,15}",message="INVALID_FORMAT") String credit
    ) {
        public UnitOpening { unitNumber=com.moahome.server.common.validation.TextValues.strip(unitNumber); }
    }
    public record AccountOpening(@NotNull(message="REQUIRED") @Min(0) Integer accountIndex,
        @NotNull(message="REQUIRED") @Pattern(regexp="[0-9]{1,15}",message="INVALID_FORMAT") String amount) {}
    public record BuildingOpening(@NotBlank(message="REQUIRED") String buildingClientId,
        @NotNull(message="REQUIRED") @Pattern(regexp="-?[0-9]{1,15}",message="INVALID_FORMAT") String amount) {}
    @Override public String toString() { return "RegistrationOpeningInput[REDACTED]"; }
}
