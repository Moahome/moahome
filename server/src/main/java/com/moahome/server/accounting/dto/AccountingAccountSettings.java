package com.moahome.server.accounting.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import com.moahome.server.accounting.domain.IncomeGroup;
import io.swagger.v3.oas.annotations.media.Schema;

public final class AccountingAccountSettings {
	private AccountingAccountSettings() {
	}

	@Schema(name = "AccountingAccountsWorkspace")
	public record Workspace(UUID propertyId, boolean canManage, List<Account> accounts) {
	}

	@Schema(name = "AccountingAccountSetting")
	public record Account(UUID id, String code, String name, IncomeGroup group, boolean defaultAccount,
		boolean active, boolean used, int revision) {
	}

	@Schema(name = "AccountingAccountChange")
	public record Change(int revision, String name, String code, IncomeGroup group, boolean active,
		OffsetDateTime deletedAt, OffsetDateTime changedAt) {
	}
}
