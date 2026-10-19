package com.moahome.server.property.domain;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Objects;
import java.util.UUID;
import com.moahome.server.common.validation.TextValues;

import jakarta.persistence.*;
import lombok.Getter;

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
	private java.time.LocalDate balanceCutoffDate;

	@Column(name = "first_billing_month")
	private java.time.LocalDate firstBillingMonth;

	/** 등록과 운영 개시를 분리하고 잔액 기준일 다음 거래부터 새 수납으로 처리합니다. */
	public void startManagement(java.time.LocalDate cutoff, java.time.YearMonth firstMonth, OffsetDateTime at) {
		if (managementStartedAt != null || !firstMonth.atDay(1).isAfter(cutoff)) {
			throw new IllegalStateException("Management start conflict");
		}
		balanceCutoffDate = Objects.requireNonNull(cutoff);
		firstBillingMonth = firstMonth.atDay(1);
		managementStartedAt = Objects.requireNonNull(at);
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
