package com.moahome.server.notice.dto;

import java.util.UUID;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record NoticeSaveRequest(@NotNull UUID requestId, @PositiveOrZero long expectedVersion,
	@NotBlank @Size(max = 200) String title, @NotBlank @Size(max = 7000000) String content, boolean important) {
}
