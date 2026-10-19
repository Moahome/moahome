package com.moahome.server.membership.domain;

import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** 가입 신청은 승인 전 권한을 만들지 않고 관리자가 확인한 명부와 계정을 승인 시 연결합니다. */
@Getter
@Entity
@Table(name = "membership_requests")
public class MembershipRequest {
	@Id
	private UUID id;

	@Column(name = "property_id")
	private UUID propertyId;

	@Column(name = "unit_id")
	private UUID unitId;

	@Column(name = "user_id")
	private UUID userId;

	@Column(name = "matched_resident_id")
	private UUID matchedResidentId;

	@Column(name = "request_phone_encrypted", columnDefinition = "text")
	private String phoneEncrypted;

	@JdbcTypeCode(SqlTypes.CHAR)
	@Column(name = "request_phone_hmac", columnDefinition = "char(64)")
	private String phoneHmac;

	@JdbcTypeCode(SqlTypes.CHAR)
	@Column(name = "request_phone_last4", columnDefinition = "char(4)")
	private String phoneLast4;

	@Column(name = "match_status")
	private String matchStatus;

	@Column
	private String status;

	@Column(name = "updated_at", columnDefinition = "timestamptz")
	private OffsetDateTime updatedAt;

	@Column(name = "deleted_at", columnDefinition = "timestamptz")
	private OffsetDateTime deletedAt;

	@Column(name = "requested_at", columnDefinition = "timestamptz")
	private OffsetDateTime requestedAt;

	@Column(name = "created_at", columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	@Column(name = "reviewed_by")
	private UUID reviewedBy;

	@Column(name = "reviewed_at", columnDefinition = "timestamptz")
	private OffsetDateTime reviewedAt;

	protected MembershipRequest() {
	}

	/** 입력한 세대·연락처로 신청만 기록하며 전화번호 일치만으로 주민을 자동 연결하지 않습니다. */
	public static MembershipRequest request(UUID property, UUID unit, UUID user, String encrypted, String hmac,
	    String last4, OffsetDateTime at) {
		var request = new MembershipRequest();
		request.id = UUID.randomUUID();
		request.propertyId = property;
		request.unitId = unit;
		request.userId = user;
		request.phoneEncrypted = encrypted;
		request.phoneHmac = hmac;
		request.phoneLast4 = last4;
		request.status = "PENDING";
		request.matchStatus = "NOT_MATCHED";
		request.requestedAt = at;
		request.createdAt = at;
		request.updatedAt = at;
		return request;
	}

	/** 명시적으로 선택한 주민만 승인 연결하고 최초 검토자·시각을 보존합니다. */
	public void approve(UUID resident, UUID actor, OffsetDateTime at) {
		if (!"PENDING".equals(status))
			throw new IllegalStateException("Request is not pending");
		matchedResidentId = resident;
		matchStatus = "MANUAL";
		status = "APPROVED";
		reviewedBy = actor;
		reviewedAt = at;
		updatedAt = at;
	}

	public void reject(UUID actor, OffsetDateTime at) {
		if (!"PENDING".equals(status))
			throw new IllegalStateException("Request is not pending");
		status = "REJECTED";
		reviewedBy = actor;
		reviewedAt = at;
		updatedAt = at;
	}

	/** 관리소장이 변경한 현재 연락처를 확인된 신청에 함께 반영하며 미확인 사람의 신청을 전화번호로 추측하지 않습니다. */
	public void changePhone(String encrypted, String hmac, String last4, OffsetDateTime at) {
		if (encrypted == null || hmac == null || last4 == null)
			throw new IllegalArgumentException("Request contact required");
		phoneEncrypted = encrypted;
		phoneHmac = hmac;
		phoneLast4 = last4;
		updatedAt = at;
	}

	/** 삭제한 주민의 대기 신청이 나중에 승인되어 권한을 다시 부여하지 않도록 현재 대기를 취소합니다. */
	public void cancelPending(OffsetDateTime at) {
		if (!"PENDING".equals(status))
			return;
		status = "CANCELED";
		updatedAt = at;
	}
}
