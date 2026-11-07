package com.moahome.server.accounting.domain;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;

@Getter
@Entity
@Table(name = "accounting_profiles")
public class AccountingProfile {
	@Id
	private UUID propertyId;

	@Column(nullable = false)
	private LocalDate startMonth;

	@Column(nullable = false)
	private int fiscalYearStartMonth;

	@Column(nullable = false)
	private UUID createdBy;

	@Column(nullable = false)
	private OffsetDateTime createdAt;

	protected AccountingProfile() {
	}

	/** 회계 시작은 첫 부과월로 연결하고 기존 저장 이력은 직접 덮어쓰지 않습니다. */
	public static AccountingProfile create(UUID property, YearMonth start, int fiscalStart, UUID actor,
		OffsetDateTime at) {
		if (fiscalStart < 1 || fiscalStart > 12)
			throw new IllegalArgumentException("Invalid fiscal year start");
		AccountingProfile profile = new AccountingProfile();
		profile.propertyId = property;
		profile.startMonth = start.atDay(1);
		profile.fiscalYearStartMonth = fiscalStart;
		profile.createdBy = actor;
		profile.createdAt = at;
		return profile;
	}
}
