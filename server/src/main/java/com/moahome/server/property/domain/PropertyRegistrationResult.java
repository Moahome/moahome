package com.moahome.server.property.domain;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.moahome.server.common.validation.TextValues;

@Getter
@Entity
@Table(name = "property_registration_results")
public class PropertyRegistrationResult {
	@EmbeddedId
	private PropertyRegistrationId id;

	@JdbcTypeCode(SqlTypes.CHAR)
	@Column(name = "request_fingerprint", nullable = false, updatable = false, columnDefinition = "char(64)")
	private String requestFingerprint;

	@Column(name = "fingerprint_key_version", nullable = false, updatable = false, length = 30)
	private String fingerprintKeyVersion;

	@Column(name = "property_id", nullable = false, updatable = false, unique = true)
	private UUID propertyId;

	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "response_snapshot", nullable = false, updatable = false, columnDefinition = "jsonb")
	private String responseSnapshot;

	@Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	protected PropertyRegistrationResult() {
	}

	/** 민감한 요청 원문을 보관하지 않고 성공 응답과 버전이 있는 HMAC 지문만 보관합니다. */
	public static PropertyRegistrationResult success(UUID userId, UUID requestId, String fingerprint, String keyVersion,
	    UUID propertyId, String responseSnapshot, OffsetDateTime at) {
		if (fingerprint == null || !fingerprint.matches("[0-9a-f]{64}")) {
			throw new IllegalArgumentException("Invalid registration fingerprint");
		}
		PropertyRegistrationResult result = new PropertyRegistrationResult();
		result.id = new PropertyRegistrationId(userId, requestId);
		result.requestFingerprint = fingerprint;
		result.fingerprintKeyVersion = TextValues.required(keyVersion, 30);
		result.propertyId = Objects.requireNonNull(propertyId);
		result.responseSnapshot = Objects.requireNonNull(responseSnapshot);
		result.createdAt = Objects.requireNonNull(at);
		return result;
	}
}
