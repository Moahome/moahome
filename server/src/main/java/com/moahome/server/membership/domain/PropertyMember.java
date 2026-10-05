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
