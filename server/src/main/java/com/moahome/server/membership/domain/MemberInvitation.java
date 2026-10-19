package com.moahome.server.membership.domain;

import java.time.OffsetDateTime;
import java.util.*;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(name = "member_invitations")
public class MemberInvitation {
	@Id
	private UUID id;

	@Column(name = "property_id", nullable = false)
	private UUID propertyId;

	@Column(name = "token_hash", nullable = false, length = 64)
	private String tokenHash;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private PropertyMemberRole role;

	@Column(nullable = false, length = 20)
	private String status;

	@Version
	private long revision;

	@Column(name = "created_by", nullable = false)
	private UUID createdBy;

	@Column(name = "created_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	@Column(name = "expires_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime expiresAt;

	@Column(name = "requested_by")
	private UUID requestedBy;

	@Column(name = "requested_at", columnDefinition = "timestamptz")
	private OffsetDateTime requestedAt;

	@Column(name = "reviewed_by")
	private UUID reviewedBy;

	@Column(name = "reviewed_at", columnDefinition = "timestamptz")
	private OffsetDateTime reviewedAt;

	protected MemberInvitation() {
	}

	/** 외부 부담당자 초대코드는 해시만 저장하고 1일 동안 한 계정만 신청할 수 있으며 신청 자체로 권한을 부여하지 않습니다. */
	public static MemberInvitation issue(UUID property, String hash, UUID actor, OffsetDateTime at) {
		var invite = new MemberInvitation();
		invite.id = UUID.randomUUID();
		invite.propertyId = property;
		invite.role = PropertyMemberRole.MANAGER;
		invite.tokenHash = hash;
		invite.status = "ISSUED";
		invite.createdBy = actor;
		invite.createdAt = at;
		invite.expiresAt = at.plusDays(1);
		return invite;
	}

	public void request(UUID actor, OffsetDateTime at) {
		requireLive(at);
		if ("REQUESTED".equals(status) && actor.equals(requestedBy))
			return;
		if (!"ISSUED".equals(status))
			throw new IllegalStateException("Invitation already used");
		requestedBy = actor;
		requestedAt = at;
		status = "REQUESTED";
	}

	public void requireLive(OffsetDateTime at) {
		if (!at.isBefore(expiresAt))
			throw new IllegalStateException("Invitation expired");
	}

	public void approve(UUID actor, OffsetDateTime at) {
		requireLive(at);
		if (!"REQUESTED".equals(status))
			throw new IllegalStateException("Invitation has no request");
		status = "APPROVED";
		reviewedBy = actor;
		reviewedAt = at;
	}

	/** 철회는 승인 후 참여 권한을 지우는 동작과 구분합니다. */
	public void revoke(UUID actor, OffsetDateTime at) {
		if ("REVOKED".equals(status))
			return;
		if ("APPROVED".equals(status))
			throw new IllegalStateException("Invitation already approved");
		status = "REVOKED";
		reviewedBy = actor;
		reviewedAt = at;
	}
}
