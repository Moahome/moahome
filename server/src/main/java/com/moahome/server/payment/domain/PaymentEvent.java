package com.moahome.server.payment.domain;

import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(name = "payment_events")
public class PaymentEvent {
	@Id
	private UUID id;

	@Column(name = "property_id", nullable = false)
	private UUID propertyId;

	@Column(name = "payment_id", nullable = false)
	private UUID paymentId;

	@Column(nullable = false, length = 30)
	private String action;

	@Column(name = "actor_id", nullable = false)
	private UUID actorId;

	@Column(name = "reason_encrypted", columnDefinition = "text")
	private String reasonEncrypted;

	@Column(name = "created_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	protected PaymentEvent() {
	}

	public static PaymentEvent record(Payment p, String action, String reason, UUID actor, OffsetDateTime at) {
		var e = new PaymentEvent();
		e.id = UUID.randomUUID();
		e.propertyId = p.getPropertyId();
		e.paymentId = p.getId();
		e.action = action;
		e.reasonEncrypted = reason;
		e.actorId = actor;
		e.createdAt = at;
		return e;
	}
}
