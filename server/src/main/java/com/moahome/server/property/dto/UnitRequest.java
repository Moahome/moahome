package com.moahome.server.property.dto;

import java.util.UUID;
import com.moahome.server.common.validation.TextInput;
import com.moahome.server.common.validation.TextValues;
import jakarta.validation.constraints.*;

public record UnitRequest(UUID buildingId, @TextInput(max = 30) String unitNumber,
    @TextInput(max = 50, optional = true) String displayName, @Min(-32768) @Max(32767) Integer floor,
    @NotNull @Pattern(regexp = "ACTIVE|VACANT") String status) {
	/** 초기 등록과 동일하게 호수의 문자·앞자리 0을 보존하고 선택적인 빈 이름만 null로 정리합니다. */
	public UnitRequest {
		unitNumber = TextValues.strip(unitNumber);
		displayName = TextValues.optional(displayName);
	}
}
