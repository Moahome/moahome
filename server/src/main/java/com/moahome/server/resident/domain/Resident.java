package com.moahome.server.resident.domain;

import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** 실제 주민 명부의 조회 매핑입니다. 등록·수정 메서드는 해당 기능 구현 시 추가합니다. */
@Getter
@Entity
@Table(name = "residents")
public class Resident {
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
}
