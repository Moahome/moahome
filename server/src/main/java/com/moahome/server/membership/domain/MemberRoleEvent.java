package com.moahome.server.membership.domain;

import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.*;

@Entity
@Table(name = "member_role_events")
public class MemberRoleEvent {
	@Id
	private UUID id;

	@Column(name = "property_id", nullable = false)
	private UUID propertyId;

	@Column(name = "member_id", nullable = false)
	private UUID memberId;

	@Column(name = "actor_id", nullable = false)
	private UUID actorId;

	@Column(nullable = false, length = 20)
	private String action;

	@Enumerated(EnumType.STRING)
	@Column(name = "previous_role", length = 20)
	private PropertyMemberRole previousRole;

	@Enumerated(EnumType.STRING)
	@Column(name = "next_role", nullable = false, length = 20)
	private PropertyMemberRole nextRole;

	@Column(name = "changed_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime changedAt;

	protected MemberRoleEvent() {
	}

	/** 개인정보나 초대 원문 없이 역할 변경 전후·처리자·시각만 보존합니다. */
	public static MemberRoleEvent record(PropertyMember member, PropertyMemberRole previous, UUID actor,
	    OffsetDateTime at) {
		var event = new MemberRoleEvent();
		event.id = UUID.randomUUID();
		event.propertyId = member.getPropertyId();
		event.memberId = member.getId();
		event.actorId = actor;
		event.previousRole = previous;
		event.nextRole = member.getRole();
		event.changedAt = at;
		event.action = !member.isCurrent() ? "ENDED" : previous == null ? "GRANTED" : "CHANGED";
		return event;
	}
}
