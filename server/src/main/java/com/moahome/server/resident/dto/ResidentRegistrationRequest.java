package com.moahome.server.resident.dto;

import java.util.UUID;
import jakarta.validation.constraints.*;
import com.moahome.server.common.validation.TextInput;
import com.moahome.server.common.validation.TextValues;

/** 요청 ID는 응답 유실 후 같은 등록을 재시도해도 주민이 중복 생성되지 않도록 사용합니다. */
public record ResidentRegistrationRequest(
	@NotNull UUID requestId,
	@TextInput(max = 50) String name,
	@Size(max = 64) String phone,
	@NotNull UUID unitId,
	@NotBlank @Pattern(regexp = "OWNER|TENANT|FAMILY|OTHER") String relationType
) {
	public ResidentRegistrationRequest { name = TextValues.strip(name); phone = TextValues.optional(phone); }

	@Override public String toString() { return "ResidentRegistrationRequest[REDACTED]"; }
}
