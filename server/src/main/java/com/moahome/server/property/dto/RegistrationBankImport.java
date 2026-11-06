package com.moahome.server.property.dto;

import java.util.List;
import java.util.UUID;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import com.moahome.server.common.validation.TextInput;

/** 파일 원문을 최종 제출에서 다시 검증하고 임시 세대·동 참조만 실제 ID로 연결합니다. */
public record RegistrationBankImport(@NotNull @Min(0) Integer accountIndex,
    @NotBlank @Size(max = 255) String fileName, @NotBlank @Size(max = 6990508) String content,
    @NotEmpty @Size(max = 5000) List<@NotNull @Valid Choice> rows) {

	public record Choice(@NotNull UUID id, @Min(0) Integer unitIndex,
	    @TextInput(max = 100, optional = true) String incomeCategory,
	    @TextInput(max = 500, optional = true) String incomeNote,
	    @Valid Distribution expense, @Valid Distribution incomeAllocation, boolean transfer,
	    @JsonInclude(JsonInclude.Include.NON_NULL) @Min(0) Integer transferAccountIndex,
	    @JsonInclude(JsonInclude.Include.NON_NULL) @Size(max = 100) List<@NotNull @Valid TransferShare> transferAllocations) {
		public Choice(UUID id, Integer unitIndex, String incomeCategory, String incomeNote,
		    Distribution expense, Distribution incomeAllocation, boolean transfer, Integer transferAccountIndex) {
			this(id, unitIndex, incomeCategory, incomeNote, expense, incomeAllocation, transfer, transferAccountIndex, null);
		}
		public Choice(UUID id, Integer unitIndex, String incomeCategory, String incomeNote,
		    Distribution expense, Distribution incomeAllocation, boolean transfer) {
			this(id, unitIndex, incomeCategory, incomeNote, expense, incomeAllocation, transfer, null);
		}
	}

	public record TransferShare(@NotNull @Pattern(regexp = "[A-Za-z0-9_-]{1,50}") String buildingClientId,
	    @NotNull @Pattern(regexp = "[0-9]{1,15}") String amount) {
	}

	public record Distribution(@TextInput(max = 100) String category,
	    @TextInput(max = 500, optional = true) String note,
	    @NotNull @Pattern(regexp = "EQUAL|RATIO|AMOUNT|PROPERTY") String mode, boolean saveAsRule,
	    @NotNull @Size(max = 100) List<@NotNull @Valid Share> allocations,
	    @JsonInclude(JsonInclude.Include.NON_NULL)
	    @Pattern(regexp = "8[0-9]{2}") String accountCode) {
		public Distribution(String category, String note, String mode, boolean saveAsRule, List<Share> allocations) {
			this(category, note, mode, saveAsRule, allocations, null);
		}

		/** 공용 지출을 가상의 동·외부 부담처로 배분하지 않도록 입력 구조를 검사합니다. */
		@AssertTrue(message = "INVALID_ALLOCATION")
		@JsonIgnore
		public boolean isAllocationShapeValid() {
			if (allocations == null || mode == null) return false;
			return "PROPERTY".equals(mode) ? allocations.isEmpty() : !allocations.isEmpty();
		}
	}

	public record Share(@Pattern(regexp = "[A-Za-z0-9_-]{1,50}") String buildingClientId,
	    @TextInput(max = 100, optional = true) String label,
	    @Pattern(regexp = "[0-9]{1,15}") String amount,
	    @Pattern(regexp = "[0-9]{1,3}(\\.[0-9]{1,2})?") String percentage) {
	}

	@Override
	public String toString() {
		return "RegistrationBankImport[REDACTED]";
	}
}
