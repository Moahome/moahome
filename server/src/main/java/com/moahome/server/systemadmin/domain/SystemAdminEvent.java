package com.moahome.server.systemadmin.domain;

import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;

/** 권한 변경의 요청 ID와 전후 값만 보존하며 회원 이름·연락처를 복사하지 않습니다. */
@Getter
@Entity
@Table(name = "system_admin_events")
public class SystemAdminEvent {
	@Id
	private UUID requestId;
	@Column(nullable = false)
	private UUID actorId;
	@Column(nullable = false)
	private UUID targetId;
	@Column(nullable = false, length = 30)
	private String action;
	@Column(nullable = false, length = 20)
	private String previousValue;
	@Column(nullable = false, length = 20)
	private String requestedValue;
	@Column(nullable = false)
	private OffsetDateTime createdAt;

	protected SystemAdminEvent() {
	}

	public SystemAdminEvent(UUID requestId, UUID actorId, UUID targetId, String action,
	    String previousValue, String requestedValue, OffsetDateTime createdAt) {
		this.requestId = requestId;
		this.actorId = actorId;
		this.targetId = targetId;
		this.action = action;
		this.previousValue = previousValue;
		this.requestedValue = requestedValue;
		this.createdAt = createdAt;
	}

	/** 응답 유실 재시도는 최초 요청 내용으로 판단하고 다른 사용자의 UUID 재사용을 거부합니다. */
	public boolean matches(UUID actor, UUID target, String kind, String requested) {
		return actorId.equals(actor) && targetId.equals(target) && action.equals(kind)
		    && requestedValue.equals(requested);
	}
}
