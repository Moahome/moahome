package com.moahome.server.property.domain;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.*;
import lombok.Getter;

import com.moahome.server.common.validation.TextValues;
import com.moahome.server.billing.domain.BillingCalendar;

@Getter
@Entity
@Table(name = "properties")
public class Property {
	@Id
	@Column(nullable = false, updatable = false)
	private UUID id;

	@Column(nullable = false, length = 50)
	private String name;

	@Column(nullable = false, length = 255)
	private String address;

	@Column(name = "address_detail", length = 255)
	private String addressDetail;

	@Column(name = "property_type", length = 30)
	private String propertyType;

	@Column(name = "has_buildings", nullable = false)
	private boolean hasBuildings;

	@Column(name = "management_started_at", columnDefinition = "timestamptz")
	private OffsetDateTime managementStartedAt;

	@Column(name = "balance_cutoff_date")
	private LocalDate balanceCutoffDate;

	@Column(name = "first_billing_month")
	private LocalDate firstBillingMonth;

	@Column(name = "initial_correction_deadline")
	private LocalDate initialCorrectionDeadline;

	/** 등록과 운영 개시를 분리하고 잔액 기준일 다음 거래부터 새 수납으로 처리합니다. */
	public void startManagement(LocalDate cutoff, YearMonth firstMonth, OffsetDateTime at) {
		if (managementStartedAt != null || !BillingCalendar.validStart(cutoff, firstMonth)) {
			throw new IllegalStateException("Management start conflict");
		}
		balanceCutoffDate = Objects.requireNonNull(cutoff);
		firstBillingMonth = firstMonth.atDay(1);
		initialCorrectionDeadline = firstMonth.atEndOfMonth();
		managementStartedAt = Objects.requireNonNull(at);
		updatedAt = at;
	}

	/** 최초 운영 시각·첫 부과월을 유지하고 허용된 초기 정정에서만 장부 기준일을 바꿉니다. */
	public void correctInitialCutoff(LocalDate cutoff, OffsetDateTime at) {
		if (managementStartedAt == null || !BillingCalendar.validStart(cutoff, YearMonth.from(firstBillingMonth)))
			throw new IllegalArgumentException("Invalid initial cutoff");
		balanceCutoffDate = cutoff;
		updatedAt = at;
	}

	/** 통장 시작 시점과 부과 시작월을 함께 정정하되 최초 정정 기한과 운영 시작 시각은 보존합니다. */
	public void correctInitialStart(LocalDate cutoff, YearMonth first, OffsetDateTime at) {
		if (managementStartedAt == null || !BillingCalendar.validStart(cutoff, first))
			throw new IllegalArgumentException("Invalid initial start");
		if (initialCorrectionDeadline == null)
			initialCorrectionDeadline = YearMonth.from(firstBillingMonth).atEndOfMonth();
		balanceCutoffDate = cutoff;
		firstBillingMonth = first.atDay(1);
		updatedAt = at;
	}

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private PropertyStatus status;

	@Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime updatedAt;

	@Column(name = "deleted_at", columnDefinition = "timestamptz")
	private OffsetDateTime deletedAt;

	@Column(name = "deleted_by")
	private UUID deletedBy;

	protected Property() {
	}

	/** 등록 기본 정보를 검증하고 활성 관리대상을 생성합니다. */
	public static Property create(String name, String address, String addressDetail, String propertyType,
	    boolean hasBuildings, OffsetDateTime at) {
		Property property = new Property();
		property.name = TextValues.required(name, 50);
		property.address = TextValues.required(address, 255);
		property.addressDetail = TextValues.optional(addressDetail, 255);
		property.propertyType = TextValues.optional(propertyType, 30);
		property.hasBuildings = hasBuildings;
		property.status = PropertyStatus.ACTIVE;
		property.initialize(at);
		return property;
	}

	/** 신규 레코드 모두에 등록 시각을 적용해 초기 설정과 응답 시각을 일치시킵니다. */
	private void initialize(OffsetDateTime at) {
		id = UUID.randomUUID();
		createdAt = Objects.requireNonNull(at);
		updatedAt = at;
	}

	@PreUpdate
	private void updateTimestamp() {
		updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
	}
}
