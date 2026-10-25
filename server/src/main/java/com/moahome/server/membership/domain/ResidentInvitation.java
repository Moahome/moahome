package com.moahome.server.membership.domain;

import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;

/** 주민을 미리 지정한 개인 초대이며 토큰 원문 없이 발급·수락·정정 검토의 출처를 보존합니다. */
@Getter
@Entity
@Table(name = "resident_invitations")
public class ResidentInvitation {
	@Id
	private UUID id;

	@Column(name = "property_id")
	private UUID propertyId;

	@Column(name = "resident_id")
	private UUID residentId;

	@Column(name = "unit_id")
	private UUID unitId;

	@Column(name = "unit_resident_id")
	private UUID unitResidentId;

	@Column(name = "resident_updated_at", columnDefinition = "timestamptz")
	private OffsetDateTime residentUpdatedAt;

	@org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.CHAR)
	@Column(name = "token_hash", columnDefinition = "char(64)")
	private String tokenHash;

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

	@Column(name = "requested_by")
	private UUID requestedBy;

	@Column(name = "requested_at", columnDefinition = "timestamptz")
	private OffsetDateTime requestedAt;

	@Column(name = "requested_name")
	private String requestedName;

	@Column(name = "phone_action")
	private String phoneAction;

	@Column(name = "phone_encrypted", columnDefinition = "text")
	private String phoneEncrypted;

	@org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.CHAR)
	@Column(name = "phone_hmac", columnDefinition = "char(64)")
	private String phoneHmac;

	@org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.CHAR)
	@Column(name = "phone_last4", columnDefinition = "char(4)")
	private String phoneLast4;

	@Column(name = "reviewed_by")
	private UUID reviewedBy;

	@Column(name = "reviewed_at", columnDefinition = "timestamptz")
	private OffsetDateTime reviewedAt;
	protected ResidentInvitation() {
	}

	/** 발급 시점의 주민·세대 관계와 명부 버전을 고정하고 30분 유효한 일회용 초대를 만듭니다. */
	public static ResidentInvitation issue(UUID property, UUID resident, UUID unit, UUID relation,
	    OffsetDateTime residentVersion, String hash, UUID actor, OffsetDateTime at) {
		var invite = new ResidentInvitation();
		invite.id = UUID.randomUUID();
		invite.propertyId = property;
		invite.residentId = resident;
		invite.unitId = unit;
		invite.unitResidentId = relation;
		invite.residentUpdatedAt = residentVersion;
		invite.tokenHash = hash;
		invite.status = "ISSUED";
		invite.createdBy = actor;
		invite.createdAt = at;
		invite.expiresAt = at.plusMinutes(30);
		return invite;
	}

	/** 수락이나 정정 제출은 발급 후 30분 안에 한 계정만 수행하며 검토 기한과 구분합니다. */
	public void claim(UUID actor, OffsetDateTime at) {
		if (requestedBy != null || !"ISSUED".equals(status) || !at.isBefore(expiresAt))
			throw new IllegalStateException("Invalid invitation");
		requestedBy = actor;
		requestedAt = at;
	}

	/** 정정 요청은 명부를 덮어쓰지 않고 관리자 검토용 보호값으로 분리합니다. */
	public void requestChange(String name, String action, String encrypted, String hmac, String last4) {
		if (!"ISSUED".equals(status) || requestedBy == null)
			throw new IllegalStateException("Invalid invitation");
		requestedName = name;
		phoneAction = action;
		phoneEncrypted = encrypted;
		phoneHmac = hmac;
		phoneLast4 = last4;
		status = "CHANGE_REQUESTED";
	}

	/** 자동 승인에는 수락자를, 정정 승인에는 실제 관리소장을 처리자로 남깁니다. */
	public void approve(UUID actor, OffsetDateTime at) {
		if (requestedBy == null || !java.util.Set.of("ISSUED", "CHANGE_REQUESTED").contains(status))
			throw new IllegalStateException("Invalid invitation");
		status = "APPROVED";
		reviewedBy = actor;
		reviewedAt = at;
	}

	/** 승인 완료의 권한은 철회로 제거하지 않으며 미완료 초대만 종료합니다. */
	public void finish(String next, UUID actor, OffsetDateTime at) {
		if (!"ISSUED".equals(status) && !"CHANGE_REQUESTED".equals(status))
			throw new IllegalStateException("Invalid invitation");
		if (!java.util.Set.of("REVOKED", "REJECTED").contains(next))
			throw new IllegalArgumentException("Invalid transition");
		status = next;
		reviewedBy = actor;
		reviewedAt = at;
	}
}
