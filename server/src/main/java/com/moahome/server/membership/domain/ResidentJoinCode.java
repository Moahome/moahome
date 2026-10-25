package com.moahome.server.membership.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** 공통 코드는 여러 주민의 신청에 사용하며 재발급·폐기·24시간 만료 뒤에는 새 신청을 받지 않습니다. */
@Getter
@Entity
@Table(name = "resident_join_codes")
public class ResidentJoinCode {
	@Id
	private UUID id;

	@Column(name = "property_id")
	private UUID propertyId;

	@JdbcTypeCode(SqlTypes.CHAR)
	@Column(name = "code_hash", columnDefinition = "char(64)")
	private String codeHash;

	@Column
	private String status;

	@Version
	private long revision;

	@Column(name = "created_by")
	private UUID createdBy;

	@Column(name = "created_at", columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	@Column(name = "expires_at", columnDefinition = "timestamptz")
	private OffsetDateTime expiresAt;
	protected ResidentJoinCode() {
	}

	public static ResidentJoinCode issue(UUID property, String hash, UUID actor, OffsetDateTime at) {
		var code = new ResidentJoinCode();
		code.id = UUID.randomUUID();
		code.propertyId = property;
		code.codeHash = hash;
		code.status = "ISSUED";
		code.createdBy = actor;
		code.createdAt = at;
		code.expiresAt = at.plusDays(1);
		return code;
	}

	public void revoke() {
		if (!"ISSUED".equals(status))
			throw new IllegalStateException("Invalid code");
		status = "REVOKED";
	}

	public boolean isLive(OffsetDateTime at) {
		return "ISSUED".equals(status) && at.isBefore(expiresAt);
	}
}
