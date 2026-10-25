package com.moahome.server.membership.domain;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Objects;
import java.util.UUID;
import com.moahome.server.common.validation.TextValues;
import com.moahome.server.property.domain.Property;
import com.moahome.server.user.domain.User;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(name = "property_members")
public class PropertyMember {
	@Id
	@Column(nullable = false, updatable = false)
	private UUID id;

	@Column(name = "property_id", nullable = false, updatable = false)
	private UUID propertyId;

	@Column(name = "user_id", nullable = false, updatable = false)
	private UUID userId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private PropertyMemberRole role;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private PropertyMemberStatus status;

	@Column(name = "joined_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime joinedAt;

	@Column(name = "ended_at", columnDefinition = "timestamptz")
	private OffsetDateTime endedAt;

	@Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime updatedAt;

	@Column(name = "deleted_at", columnDefinition = "timestamptz")
	private OffsetDateTime deletedAt;

	@Column(name = "deleted_by")
	private UUID deletedBy;

	protected PropertyMember() {
	}

	/** 현재 역할만 변경하고 주민 명부·세대 대표·플랫폼 권한은 함께 변경하지 않습니다. */
	public void changeRole(PropertyMemberRole next, OffsetDateTime at) {
		if (status != PropertyMemberStatus.ACTIVE || endedAt != null || deletedAt != null)
			throw new IllegalStateException("Inactive member");
		role = Objects.requireNonNull(next);
		updatedAt = Objects.requireNonNull(at);
	}

	public boolean isCurrent() {
		return status == PropertyMemberStatus.ACTIVE && endedAt == null && deletedAt == null;
	}

	/** 본인 나가기는 현재 참여만 종료하며 관리소장은 인계 전 스스로 종료할 수 없습니다. */
	public void leave(OffsetDateTime at) {
		if (!isCurrent() || role == PropertyMemberRole.ADMIN)
			throw new IllegalStateException("Current non-admin member required");
		status = PropertyMemberStatus.INACTIVE;
		endedAt = Objects.requireNonNull(at);
		updatedAt = at;
	}

	/** 외부 부담당자는 주민으로 가장하지 않고 관리자 참여를 종료합니다. */
	public void endManagerAccess(OffsetDateTime at) {
		if (role != PropertyMemberRole.MANAGER || !isCurrent())
			throw new IllegalStateException("Current manager required");
		status = PropertyMemberStatus.INACTIVE;
		endedAt = at;
		updatedAt = at;
	}

	/** 관리소장이 확인한 초대 승인의 계정에만 대상 역할을 부여합니다. */
	public static PropertyMember invited(UUID property, User user, PropertyMemberRole role, OffsetDateTime at) {
		user.requireActive();
		var member = new PropertyMember();
		member.propertyId = property;
		member.userId = user.getId();
		member.role = role;
		member.status = PropertyMemberStatus.ACTIVE;
		member.joinedAt = at;
		member.initialize(at);
		return member;
	}

	/** 명부 삭제는 해당 대상의 주민 참여만 종료하며 관리자 역할이나 다른 대상의 참여를 변경하지 않습니다. */
	public void endResidentAccess(UUID actor, OffsetDateTime at) {
		if (role != PropertyMemberRole.RESIDENT)
			throw new IllegalStateException("Resident participation required");
		status = PropertyMemberStatus.INACTIVE;
		endedAt = at;
		updatedAt = at;
	}

	/** 인증된 정상 계정을 생성자 ADMIN으로 지정하며 계정의 플랫폼 역할은 변경하지 않습니다. */
	public static PropertyMember creator(Property property, User user, OffsetDateTime at) {
		user.requireActive();
		PropertyMember member = new PropertyMember();
		member.propertyId = property.getId();
		member.userId = user.getId();
		member.role = PropertyMemberRole.ADMIN;
		member.status = PropertyMemberStatus.ACTIVE;
		member.joinedAt = at;
		member.initialize(at);
		return member;
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
