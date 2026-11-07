package com.moahome.server.accounting.domain;

import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.Arrays;
import java.util.ArrayList;
import java.util.List;
import java.nio.charset.StandardCharsets;
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

	@Column(nullable = false, length = 3)
	private String code;

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

	public boolean isBankTransfer() {
		return reportGroup == IncomeGroup.ASSET && DefaultAccount.BANK_TRANSFER.getCode().equals(code);
	}

	/** 첫 조회의 가상 기본 계정과 첫 저장의 ID를 같게 유지하며 기존에 사용한 계정 ID는 교체하지 않습니다. */
	public static List<AccountingAccount> withDefaults(UUID property, List<AccountingAccount> existing,
		UUID actor, OffsetDateTime at) {
		List<AccountingAccount> result = new ArrayList<>(existing);
		for (DefaultAccount value : DefaultAccount.values()) {
			if (result.stream().anyMatch(account -> value.getCode().equals(account.getCode())))
				continue;
			AccountingAccount account = create(property, value.getCode(), value.getName(), value.getGroup(),
				value.getSystemKey(), actor, at);
			account.id = UUID.nameUUIDFromBytes(("moahome:accounting:" + property + ":" + value.getCode())
				.getBytes(StandardCharsets.UTF_8));
			result.add(account);
		}
		return List.copyOf(result);
	}

	/** 코드와 유형을 함께 검증하며 표시 코드와 별개인 계정 ID로 원천을 연결합니다. */
	public static AccountingAccount create(UUID property, String code, String name, IncomeGroup group, String systemKey,
		UUID actor, OffsetDateTime at) {
		if (group == null || !group.acceptsCode(code))
			throw new IllegalArgumentException("Invalid account group");
		if (systemKey != null && Arrays.stream(DefaultAccount.values()).noneMatch(value ->
			systemKey.equals(value.getSystemKey()) && group == value.getGroup() && code.equals(value.getCode())))
			throw new IllegalArgumentException("Invalid system account");
		AccountingAccount account = new AccountingAccount();
		account.id = UUID.randomUUID();
		account.propertyId = property;
		account.name = TextValues.required(name, 100);
		account.code = code;
		account.reportGroup = group;
		account.systemKey = systemKey;
		account.createdBy = actor;
		account.createdAt = at;
		return account;
	}
}
