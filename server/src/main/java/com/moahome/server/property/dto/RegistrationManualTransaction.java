package com.moahome.server.property.dto;

import java.time.LocalDate;
import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import com.moahome.server.common.validation.TextInput;

/** 초기 수기 입출금도 원본 날짜·금액과 용도를 명시하며 최종 등록과 같은 트랜잭션에 저장합니다. */
public record RegistrationManualTransaction(@NotNull UUID id, @NotNull @Min(0) Integer accountIndex,
    @NotNull @Pattern(regexp = "INCOME|EXPENSE") String direction, @NotNull LocalDate date,
    @NotNull @Pattern(regexp = "[0-9]{1,15}") String amount, @TextInput(max = 100) String payer,
    @NotNull @Pattern(regexp = "HOUSEHOLD|OTHER|SHARED") String purpose, @Min(0) Integer unitIndex,
    @TextInput(max = 100, optional = true) String category, @TextInput(max = 500, optional = true) String note,
    @Valid RegistrationBankImport.Distribution allocation) {
	@Override
	public String toString() {
		return "RegistrationManualTransaction[REDACTED]";
	}
}
