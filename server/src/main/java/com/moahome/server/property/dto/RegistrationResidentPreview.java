package com.moahome.server.property.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import com.moahome.server.common.validation.TextInput;
import com.moahome.server.property.dto.PropertyRegistrationRequest.BuildingInput;

public final class RegistrationResidentPreview {
	private RegistrationResidentPreview() {
	}

	public record Setup(@NotNull Boolean hasBuildings,
	    @NotNull @Size(max = 1000) List<@NotNull @Valid BuildingInput> buildings,
	    @NotEmpty @Size(max = 10000) List<@NotNull @Valid UnitReference> units, @Valid Administrator administrator) {
		@Override
		public String toString() {
			return "Setup[REDACTED]";
		}
	}

	public record UnitReference(@Size(max = 50) String buildingClientId, @TextInput(max = 30) String unitNumber) {
	}

	public record Administrator(@TextInput(max = 50) String name, @Min(0) int unitIndex) {
	}

	/** 동의한 번호만 응답하며 주민 명부 저장은 최종 등록 요청에서 다시 검증합니다. */
	public record Row(int rowNumber, String buildingClientId, String unitNumber, String name, String phone,
	    boolean phoneConsent, String relationType, String status, String reason) {
		@Override
		public String toString() {
			return "Row[REDACTED]";
		}
	}
}
