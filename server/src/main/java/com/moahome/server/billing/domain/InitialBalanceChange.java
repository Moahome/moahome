package com.moahome.server.billing.domain;

import java.time.*;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;

/** 초기 기준 정정의 요청·전후 값은 같은 트랜잭션에서 저장하고 이후 변경·삭제하지 않습니다. */
@Getter
@Entity
@Table(name = "initial_balance_changes")
public class InitialBalanceChange {
	@Id
	private UUID id;

	@Column(name = "property_id", nullable = false)
	private UUID propertyId;

	@Column(nullable = false)
	private String kind;

	@Column(name = "request_body", nullable = false, columnDefinition = "text")
	private String requestBody;

	@Column(name = "previous_date")
	private LocalDate previousDate;

	@Column(name = "new_date")
	private LocalDate newDate;

	@Column(nullable = false, columnDefinition = "text")
	private String details;

	@Column(nullable = false, length = 500)
	private String reason;

	@Column(name = "changed_by", nullable = false)
	private UUID changedBy;

	@Column(name = "changed_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime changedAt;

	protected InitialBalanceChange() {
	}

	/** 검증된 초기 기준의 전후 값과 요청 식별자를 하나의 변경 불가능한 감사 행으로 보관합니다. */
	public static InitialBalanceChange record(UUID id, UUID property, String kind, String request,
	    LocalDate previous, LocalDate next, String details, String reason, UUID actor, OffsetDateTime at) {
		var row = new InitialBalanceChange();
		row.id = id;
		row.propertyId = property;
		row.kind = kind;
		row.requestBody = request;
		row.previousDate = previous;
		row.newDate = next;
		row.details = details;
		row.reason = reason;
		row.changedBy = actor;
		row.changedAt = at;
		return row;
	}
}
