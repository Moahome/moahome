package com.moahome.server.membership.dto;

import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;

import com.moahome.server.membership.domain.PropertyMemberRole;

public final class MemberRequests {
	private MemberRequests() {
	}

	public record Role(@NotNull PropertyMemberRole role, @NotNull PropertyMemberRole expectedRole) {
	}

	public enum LeaveReason {
		SERVICE_ONLY, MOVE_OUT
	}

	public record Leave(@NotNull LeaveReason reason) {
		/** 본인과 처리 시각은 서버에서 결정하며 다른 계정·세대 식별자 입력을 거부합니다. */
		@JsonAnySetter
		public void rejectUnknown(String _name, Object _value) {
			throw new IllegalArgumentException("Unknown leave field");
		}
	}

	@Schema(additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
	public record OwnResident(@NotNull UUID residentId, @NotNull UUID expectedUnitId) {
		/** 계정·역할은 인증 정보로 결정하므로 요청에 임의 식별자를 추가할 수 없도록 계약 밖 필드를 거부합니다. */
		@JsonAnySetter
		public void rejectUnknown(String _name, Object _value) {
			throw new IllegalArgumentException("Unknown account link field");
		}
	}

	public record Invitation(UUID residentId) {
	}

	public record Version(@NotNull Long revision) {
	}

	public record Claim(@NotBlank @Size(max = 100) String code) {
		@Override
		public String toString() {
			return "Claim[REDACTED]";
		}
	}
}
