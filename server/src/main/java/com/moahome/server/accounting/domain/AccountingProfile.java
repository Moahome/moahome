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

	/** 실제 시작 월은 관리자가 명시하며 통장 시작일이나 과거 청구를 근거로 자동 확정하지 않습니다. */
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
