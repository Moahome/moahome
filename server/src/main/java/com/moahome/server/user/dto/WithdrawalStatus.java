package com.moahome.server.user.dto;

import java.util.List;
import java.util.UUID;

public record WithdrawalStatus(UUID userId, boolean canWithdraw, List<ManagedProperty> managedProperties) {
	public record ManagedProperty(UUID id, String name) {
	}
}
