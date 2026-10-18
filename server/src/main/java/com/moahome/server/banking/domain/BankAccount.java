package com.moahome.server.banking.domain;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Objects;
import java.util.UUID;
import com.moahome.server.common.validation.TextValues;
import com.moahome.server.property.domain.Property;
import com.moahome.server.common.security.AccountNumberSecurity;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(name = "bank_accounts")
public class BankAccount {
	@Id
	@Column(nullable = false, updatable = false)
	private UUID id;

	@Column(name = "property_id", nullable = false, updatable = false)
	private UUID propertyId;

	@Column(name = "building_id")
	private UUID buildingId;

	@Column(name = "holder_resident_id")
	private UUID holderResidentId;

	@Column(name = "holder_name_snapshot", nullable = false, length = 50)
	private String holderNameSnapshot;

	@Column(name = "bank_code", nullable = false, length = 20)
	private String bankCode;

	@Column(name = "bank_name", nullable = false, length = 50)
	private String bankName;

	@Column(name = "account_number_encrypted", nullable = false, columnDefinition = "text")
	private String accountNumberEncrypted;

	@org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.CHAR)
	@Column(name = "account_number_hmac", nullable = false, columnDefinition = "char(64)")
	private String accountNumberHmac;

	@Column(name = "account_last4", nullable = false, length = 4)
	private String accountLast4;

	@Column(name = "gl_account_id")
	private UUID glAccountId;

	@Column(name = "is_primary", nullable = false)
	private boolean primary;

	@Column(name = "valid_from", nullable = false)
	private java.time.LocalDate validFrom;

	@Column(name = "valid_to")
	private java.time.LocalDate validTo;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private BankAccountStatus status;

	@Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime updatedAt;

	@Column(name = "deleted_at", columnDefinition = "timestamptz")
	private OffsetDateTime deletedAt;

	@Column(name = "deleted_by")
	private UUID deletedBy;

	protected BankAccount() {
	}

	/** 원문 대신 보호된 계좌번호를 저장하고 등록 시각의 서울 날짜를 사용 시작일로 지정합니다. */
	public static BankAccount createPublic(Property property, String bankCode, String bankName, String holderName,
		AccountNumberSecurity.ProtectedAccountNumber number, boolean primary, OffsetDateTime at) {
		Objects.requireNonNull(number);
		BankAccount account = new BankAccount();
		account.propertyId = property.getId();
		account.bankCode = TextValues.required(bankCode, 20);
		account.bankName = TextValues.required(bankName, 50);
		account.holderNameSnapshot = TextValues.required(holderName, 50);
		account.accountNumberEncrypted = TextValues.required(number.encrypted(), 512);
		account.accountNumberHmac = TextValues.required(number.hmac(), 64);
		account.accountLast4 = TextValues.required(number.last4(), 4);
		account.primary = primary;
		account.validFrom = at.atZoneSameInstant(java.time.ZoneId.of("Asia/Seoul")).toLocalDate();
		account.status = BankAccountStatus.ACTIVE;
		account.initialize(at);
		return account;
	}

	/** 신규 레코드 모두에 등록 시각을 적용해 초기 설정과 응답 시각을 일치시킵니다. */
	private void initialize(OffsetDateTime at) {
		id = UUID.randomUUID();
		createdAt = Objects.requireNonNull(at);
		updatedAt = at;
	}

	/** 동일 계좌의 오입력 정보만 정정하며 ID·사용기간·기본 지정과 기존 거래 연결은 유지합니다. */
	public void correctDetails(String bankCode, String bankName, String holderName,
		AccountNumberSecurity.ProtectedAccountNumber number) {
		if (deletedAt != null || status != BankAccountStatus.ACTIVE || !primary || buildingId != null) {
			throw new IllegalStateException("Account is not an active public primary account");
		}
		Objects.requireNonNull(number);
		this.bankCode = TextValues.required(bankCode, 20);
		this.bankName = TextValues.required(bankName, 50);
		this.holderNameSnapshot = TextValues.required(holderName, 50);
		this.accountNumberEncrypted = TextValues.required(number.encrypted(), 512);
		this.accountNumberHmac = TextValues.required(number.hmac(), 64);
		this.accountLast4 = TextValues.required(number.last4(), 4);
	}

	@PreUpdate
	private void updateTimestamp() {
		// PostgreSQL의 마이크로초 정밀도와 맞춰 응답 직후 재수정의 버전 비교가 어긋나지 않게 합니다.
		var now = OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
		updatedAt = now.isAfter(updatedAt) ? now : updatedAt.plusNanos(1000);
	}
}
