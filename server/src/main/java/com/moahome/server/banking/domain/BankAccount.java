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

	@Column(name = "account_alias", length = 100)
	private String alias;

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

	@Column(name = "registration_order", nullable = false, updatable = false)
	private int registrationOrder;

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
		return createPublic(property, bankCode, bankName, holderName, number, primary, 0, at);
	}

	/** 초기 설정의 입력 순서를 보존하고 기본 지정·은행명 변경으로 목록 순서가 바뀌지 않게 합니다. */
	public static BankAccount createPublic(Property property, String bankCode, String bankName, String holderName,
		AccountNumberSecurity.ProtectedAccountNumber number, boolean primary, int registrationOrder, OffsetDateTime at) {
		if (registrationOrder < 0) throw new IllegalArgumentException("Invalid registration order");
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
		account.registrationOrder = registrationOrder;
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
		if (deletedAt != null || status != BankAccountStatus.ACTIVE || buildingId != null) {
			throw new IllegalStateException("Account is not an active public account");
		}
		Objects.requireNonNull(number);
		this.bankCode = TextValues.required(bankCode, 20);
		this.bankName = TextValues.required(bankName, 50);
		this.holderNameSnapshot = TextValues.required(holderName, 50);
		this.accountNumberEncrypted = TextValues.required(number.encrypted(), 512);
		this.accountNumberHmac = TextValues.required(number.hmac(), 64);
		this.accountLast4 = TextValues.required(number.last4(), 4);
	}

	/** 추가 요청 ID를 계좌 ID로 사용해 응답 유실 재시도에도 같은 통장을 중복 생성하지 않습니다. */
	public static BankAccount register(UUID id, Property property, String bankCode, String bankName, String holderName,
		AccountNumberSecurity.ProtectedAccountNumber number, String alias, int registrationOrder, OffsetDateTime at) {
		var account = createPublic(property, bankCode, bankName, holderName, number, false, registrationOrder, at);
		account.id = Objects.requireNonNull(id);
		account.rename(alias);
		return account;
	}

	/** 용도를 고정하지 않고 관리자가 정한 선택 별칭을 저장합니다. */
	public void rename(String alias) { this.alias = TextValues.optional(alias, 100); }

	/** 기본 지정은 서비스의 관리대상 잠금 안에서 이전 계좌와 함께 전환합니다. */
	public void designatePrimary(boolean primary) {
		if (primary && (status != BankAccountStatus.ACTIVE || deletedAt != null)) throw new IllegalStateException("Inactive account");
		this.primary = primary;
	}

	/** 기본 계좌는 먼저 전환해야 종료할 수 있으며 과거 거래와 FK는 보존합니다. */
	public void close(java.time.LocalDate date) {
		if (primary) throw new IllegalStateException("Primary account cannot close");
		if (status == BankAccountStatus.CLOSED) return;
		status = BankAccountStatus.CLOSED;
		validTo = date.isBefore(validFrom) ? validFrom : date;
	}

	@PreUpdate
	private void updateTimestamp() {
		// PostgreSQL의 마이크로초 정밀도와 맞춰 응답 직후 재수정의 버전 비교가 어긋나지 않게 합니다.
		var now = OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
		updatedAt = now.isAfter(updatedAt) ? now : updatedAt.plusNanos(1000);
	}
}
