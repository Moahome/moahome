package com.moahome.server.banking.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;

/** 같은 동의 소유금을 출금 통장에서 입금 통장으로 옮긴 이체 귀속 원본입니다. */
@Getter
@Entity
@Table(name = "bank_transfer_allocations")
public class BankTransferAllocation {
	@Id
	private UUID id;
	@Column(nullable = false)
	private UUID propertyId;
	@Column(nullable = false)
	private UUID transferId;
	@Column(nullable = false)
	private UUID buildingId;
	@Column(nullable = false, precision = 15, scale = 0)
	private BigDecimal amount;
	@Column(nullable = false)
	private UUID createdBy;
	@Column(nullable = false)
	private OffsetDateTime createdAt;

	protected BankTransferAllocation() {
	}

	public static BankTransferAllocation create(UUID property, UUID transfer, UUID building, BigDecimal amount,
	    UUID actor, OffsetDateTime at) {
		BankTransferAllocation row = new BankTransferAllocation();
		row.id = UUID.randomUUID();
		row.propertyId = property;
		row.transferId = transfer;
		row.buildingId = building;
		row.amount = amount;
		row.createdBy = actor;
		row.createdAt = at;
		return row;
	}
}
