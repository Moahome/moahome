package com.moahome.server.property.dto;

import java.util.List;
import java.util.UUID;
import com.moahome.server.common.validation.TextInput;
import com.moahome.server.common.validation.TextValues;
import com.moahome.server.property.domain.Building;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

public record PropertyRegistrationRequest(
	@NotNull(message = "REQUIRED") UUID requestId,
	@NotNull(message = "REQUIRED") @Valid BasicInfoRequest basicInfo,
	@NotNull(message = "REQUIRED") List<@NotNull(message = "REQUIRED") @Valid BuildingInput> buildings,
	@NotEmpty(message = "REQUIRED") List<@NotNull(message = "REQUIRED") @Valid UnitInput> units,
	@NotEmpty(message = "REQUIRED") List<@NotNull(message = "REQUIRED") @Valid BankAccountInput> bankAccounts,
	@NotEmpty(message = "REQUIRED") List<@NotNull(message = "REQUIRED") @Valid FeeItemInput> feeItems
) {
	public static final long MAX_AMOUNT = 999_999_999_999_999L;

	public record BuildingInput(
		@NotBlank(message = "REQUIRED") @Pattern(regexp = "[A-Za-z0-9_-]{1,50}", message = "INVALID_FORMAT") String clientId,
		@TextInput(max = 50) String name
	) {
		public BuildingInput {
			name = Building.normalizeName(name);
		}
	}

	public record UnitInput(
		@Pattern(regexp = "[A-Za-z0-9_-]{1,50}", message = "INVALID_FORMAT") String buildingClientId,
		@TextInput(max = 30) String unitNumber,
		@TextInput(max = 50, optional = true) String displayName,
		@Min(value = -32768, message = "OUT_OF_RANGE") @Max(value = 32767, message = "OUT_OF_RANGE") Integer floor,
		@NotNull(message = "REQUIRED") @Pattern(regexp = "ACTIVE|VACANT", message = "INVALID_FORMAT") String status
	) {
		/** 호수는 문자와 앞자리 0을 유지하는 문자열로 정리하고 층만 정수로 받습니다. */
		public UnitInput {
			unitNumber = TextValues.strip(unitNumber);
			displayName = TextValues.optional(displayName);
		}
	}

	public record BankAccountInput(
		@TextInput(max = 20) String bankCode,
		@TextInput(max = 50) String bankName,
		@NotBlank(message = "REQUIRED") @Pattern(regexp = "[0-9]{4,50}", message = "INVALID_FORMAT") String accountNumber,
		@TextInput(max = 50) String holderName,
		@NotNull(message = "REQUIRED") Boolean isPrimary
	) {
		/** 허용된 ASCII 공백과 하이픈만 제거하며 숫자 앞자리 0을 보존합니다. */
		public BankAccountInput {
			bankCode = TextValues.strip(bankCode);
			bankName = TextValues.strip(bankName);
			accountNumber = TextValues.strip(accountNumber);
			if (accountNumber != null && accountNumber.matches("[0-9 -]*")) {
				accountNumber = accountNumber.replace(" ", "").replace("-", "");
			}
			holderName = TextValues.strip(holderName);
		}

		@Override
		public String toString() {
			return "BankAccountInput[REDACTED]";
		}
	}

	public record FeeItemInput(
		@TextInput(max = 100) String itemName,
		@NotNull(message = "REQUIRED") @Min(value = 0, message = "OUT_OF_RANGE")
		@Max(value = MAX_AMOUNT, message = "OUT_OF_RANGE") Long defaultAmount
	) {
		public FeeItemInput {
			itemName = TextValues.strip(itemName);
		}
	}
}
