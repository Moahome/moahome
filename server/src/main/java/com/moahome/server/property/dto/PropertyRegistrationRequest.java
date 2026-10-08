package com.moahome.server.property.dto;

import java.util.List;
import java.util.UUID;
import com.moahome.server.common.validation.TextInput;
import com.moahome.server.common.validation.TextValues;
import com.moahome.server.property.domain.Building;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "관리 시작 시 전체 정보를 한 번에 저장합니다. 모든 객체에서 계약 밖 필드를 거부합니다.",
	additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
public record PropertyRegistrationRequest(
	@Schema(description = "최종 제출 직전 생성한 UUID. 응답 유실 후 재시도에는 같은 ID와 본문을 사용", example = "00000000-0000-4000-8000-000000000001")
	@NotNull(message = "REQUIRED") UUID requestId,
	@NotNull(message = "REQUIRED") @Valid BasicInfoRequest basicInfo,
	@Schema(description = "동 없음이면 빈 배열, 동 있음이면 최소 1개. clientId와 정리된 동 이름은 요청 내 중복 불가")
	@NotNull(message = "REQUIRED") List<@NotNull(message = "REQUIRED") @Valid BuildingInput> buildings,
	@Schema(description = "최소 1개. 같은 동 안의 호수는 중복 불가")
	@NotEmpty(message = "REQUIRED") List<@NotNull(message = "REQUIRED") @Valid UnitInput> units,
	@Schema(description = "최소 1개의 공용계좌. isPrimary=true는 정확히 1개. 계좌번호 중복 불가")
	@NotEmpty(message = "REQUIRED") List<@NotNull(message = "REQUIRED") @Valid BankAccountInput> bankAccounts,
	@Schema(description = "최소 1개. 금액과 합계는 -999999999999999원부터 999999999999999원까지의 정수")
	@NotEmpty(message = "REQUIRED") List<@NotNull(message = "REQUIRED") @Valid FeeItemInput> feeItems
) {
	public static final long MAX_AMOUNT = 999_999_999_999_999L;

	@Schema(additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
	public record BuildingInput(
		@Schema(description = "요청 내부의 동 식별자. DB에 저장하지 않음", example = "building-1")
		@NotBlank(message = "REQUIRED") @Pattern(regexp = "[A-Za-z0-9_-]{1,50}", message = "INVALID_FORMAT") String clientId,
		@Schema(description = "동 이름. 끝에 동이 없으면 붙여 정리", example = "A동", minLength = 1, maxLength = 50, requiredMode = Schema.RequiredMode.REQUIRED)
		@TextInput(max = 50) String name
	) {
		public BuildingInput {
			name = Building.normalizeName(name);
		}
	}

	@Schema(additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
	public record UnitInput(
		@Schema(description = "동 있음이면 이번 요청의 clientId 필수, 동 없음이면 생략 / null", example = "building-1", nullable = true)
		@Pattern(regexp = "[A-Za-z0-9_-]{1,50}", message = "INVALID_FORMAT") String buildingClientId,
		@Schema(description = "호수. 앞자리 0, 문자, 내부 공백과 호 접미사 보존", example = "001호", minLength = 1, maxLength = 30, requiredMode = Schema.RequiredMode.REQUIRED)
		@TextInput(max = 30) String unitNumber,
		@Schema(description = "선택적인 표시 이름", example = "정문 세대", maxLength = 50, nullable = true)
		@TextInput(max = 50, optional = true) String displayName,
		@Schema(description = "층. 지하는 음수 정수", example = "1", nullable = true)
		@Min(value = -32768, message = "OUT_OF_RANGE") @Max(value = 32767, message = "OUT_OF_RANGE") Integer floor,
		@Schema(description = "초기 세대 상태", example = "ACTIVE", allowableValues = {"ACTIVE", "VACANT"})
		@NotNull(message = "REQUIRED") @Pattern(regexp = "ACTIVE|VACANT", message = "INVALID_FORMAT") String status
	) {
		/** 호수는 문자와 앞자리 0을 유지하는 문자열로 정리하고 층만 정수로 받습니다. */
		public UnitInput {
			unitNumber = TextValues.strip(unitNumber);
			displayName = TextValues.optional(displayName);
		}
	}

	@Schema(additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
	public record BankAccountInput(
		@Schema(description = "은행 코드", example = "004", minLength = 1, maxLength = 20, requiredMode = Schema.RequiredMode.REQUIRED)
		@TextInput(max = 20) String bankCode,
		@Schema(description = "은행 이름", example = "국민은행", minLength = 1, maxLength = 50, requiredMode = Schema.RequiredMode.REQUIRED)
		@TextInput(max = 50) String bankName,
		@Schema(description = "ASCII 숫자·공백·하이픈만 허용. 공백·하이픈 제거 후 4~50자리, 앞자리 0 보존. 예시는 가상 번호", example = "000000000000")
		@NotBlank(message = "REQUIRED") @Pattern(regexp = "[0-9]{4,50}", message = "INVALID_FORMAT") String accountNumber,
		@Schema(description = "예금주 이름. 주민 명부 연결 없이 입력", example = "예시 관리단", minLength = 1, maxLength = 50, requiredMode = Schema.RequiredMode.REQUIRED)
		@TextInput(max = 50) String holderName,
		@Schema(description = "전체 계좌 중 정확히 1개를 기본 계좌로 지정", example = "true")
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

	@Schema(additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
	public record FeeItemInput(
		@Schema(description = "기본 관리비 항목 이름", example = "공용 전기료", minLength = 1, maxLength = 100, requiredMode = Schema.RequiredMode.REQUIRED)
		@TextInput(max = 100) String itemName,
		@Schema(description = "정수 원 단위. 0원과 음수 허용. 실제 청구 / 회계 전표를 생성하지 않음", example = "10000")
		@NotNull(message = "REQUIRED") @Min(value = -MAX_AMOUNT, message = "OUT_OF_RANGE")
		@Max(value = MAX_AMOUNT, message = "OUT_OF_RANGE") Long defaultAmount
	) {
		public FeeItemInput {
			itemName = TextValues.strip(itemName);
		}
	}
}
