package com.moahome.server.resident.domain;

import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** 로그인 계정과 구분한 주민 명부이며 연락처는 암호문·검색값·끝 네 자리만 보관합니다. */
@Getter
@Entity
@Table(name = "residents")
public class Resident implements org.springframework.data.domain.Persistable<UUID> {
	@Transient private boolean newRecord;

	@Override public boolean isNew() { return newRecord; }

	@PostLoad @PostPersist
	private void markPersisted() { newRecord = false; }
	@Id
	private UUID id;
	@Column(name = "property_id", nullable = false, updatable = false)
	private UUID propertyId;
	@Column(nullable = false, length = 50)
	private String name;
	@Column(name = "phone_encrypted", columnDefinition = "text")
	private String phoneEncrypted;
	@JdbcTypeCode(SqlTypes.CHAR)
	@Column(name = "phone_hmac", length = 64, columnDefinition = "char(64)")
	private String phoneHmac;
	@JdbcTypeCode(SqlTypes.CHAR)
	@Column(name = "phone_last4", length = 4, columnDefinition = "char(4)")
	private String phoneLast4;
	@Column(name = "user_id")
	private UUID userId;
	@Column(nullable = false, length = 20)
	private String status;
	@Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;
	@Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime updatedAt;
	@Column(name = "deleted_at", columnDefinition = "timestamptz")
	private OffsetDateTime deletedAt;
	@Column(name = "deleted_by")
	private UUID deletedBy;

	protected Resident() {
	}

	/** 명부 등록만으로 계정·가입 권한을 연결하지 않고 연락처의 세 저장값은 함께 설정합니다. */
	public static Resident register(UUID id, UUID propertyId, String name, String encryptedPhone,
		String phoneHmac, String phoneLast4, OffsetDateTime at) {
		var resident = new Resident();
		// 요청 ID는 외부에서 지정하므로 신규 저장은 merge 대신 persist로 수행해 다른 대상의 ID 충돌에도 덮어쓰지 않습니다.
		resident.newRecord = true;
		resident.id = java.util.Objects.requireNonNull(id);
		resident.propertyId = java.util.Objects.requireNonNull(propertyId);
		resident.name = com.moahome.server.common.validation.TextValues.required(name, 50);
		if ((encryptedPhone == null) != (phoneHmac == null) || (encryptedPhone == null) != (phoneLast4 == null)) {
			throw new IllegalArgumentException("Incomplete protected contact");
		}
		resident.phoneEncrypted = encryptedPhone;
		resident.phoneHmac = phoneHmac;
		resident.phoneLast4 = phoneLast4;
		resident.status = "ACTIVE";
		resident.createdAt = java.util.Objects.requireNonNull(at);
		resident.updatedAt = at;
		return resident;
	}
}
