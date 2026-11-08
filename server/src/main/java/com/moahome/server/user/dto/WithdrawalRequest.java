package com.moahome.server.user.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

public record WithdrawalRequest(@NotNull @AssertTrue Boolean confirmed) {
}
