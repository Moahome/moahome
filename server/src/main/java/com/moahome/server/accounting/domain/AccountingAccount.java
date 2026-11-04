package com.moahome.server.accounting.domain;

import java.time.OffsetDateTime;
import java.util.UUID;
import com.moahome.server.common.validation.TextValues;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;

@Getter
@Entity
@Table(name = "accounting_accounts")
public class AccountingAccount {
	@Id
	private UUID id;

	@Column(nullable = false)
	private UUID propertyId;

	@Column(nullable = false, length = 100)
	private String name;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 30)
	private IncomeGroup reportGroup;

	@Column(length = 40)
	private String systemKey;

	@Column(nullable = false)
	private UUID createdBy;

	@Column(nullable = false)
	private OffsetDateTime createdAt;

	protected AccountingAccount() {
	}

	/** 이번 손익 조회에 쓰는 과목만 만들고 자산·부채 계정을 미리 생성하지 않습니다. */
	public static AccountingAccount create(UUID property, String name, IncomeGroup group, String systemKey,
		UUID actor, OffsetDateTime at) {
		if (group == null || (systemKey != null && (!"MANAGEMENT_REVENUE".equals(systemKey)
			|| group != IncomeGroup.OPERATING_REVENUE)))
			throw new IllegalArgumentException("Invalid account group");
		AccountingAccount account = new AccountingAccount();
		account.id = UUID.randomUUID();
		account.propertyId = property;
		account.name = TextValues.required(name, 100);
		account.reportGroup = group;
		account.systemKey = systemKey;
		account.createdBy = actor;
		account.createdAt = at;
		return account;
	}
}
