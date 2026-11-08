package com.moahome.server.user.dto;

import java.time.OffsetDateTime;

public record WithdrawalReceipt(OffsetDateTime requestedAt, OffsetDateTime recoverableUntil) {
}
