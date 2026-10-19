package com.moahome.server.property.domain;

import java.io.Serializable;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.EqualsAndHashCode;
import lombok.Getter;

@Getter
@EqualsAndHashCode
@Embeddable
public class PropertyRegistrationId implements Serializable {
	@Column(name = "user_id", nullable = false, updatable = false)
	private UUID userId;

	@Column(name = "request_id", nullable = false, updatable = false)
	private UUID requestId;

	protected PropertyRegistrationId() {
	}

	public PropertyRegistrationId(UUID userId, UUID requestId) {
		this.userId = java.util.Objects.requireNonNull(userId);
		this.requestId = java.util.Objects.requireNonNull(requestId);
	}
}
