package com.moahome.server.banking.domain;

import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(name = "bank_transfer_postings")
public class BankTransferPosting {

	@Id
	private UUID id;
	@Column(nullable = false)
	private UUID propertyId;
	@Column(nullable = false)
	private UUID sourceTransactionId;
	@Column(nullable = false)
	private UUID counterpartAccountId;
	private UUID counterpartTransactionId;
	@Column(nullable = false)
	private UUID accountingAccountId;
	@Column(nullable = false)
	private UUID createdBy;
	@Column(nullable = false)
	private OffsetDateTime createdAt;
	private UUID canceledBy;
	private OffsetDateTime canceledAt;

	protected BankTransferPosting() {
	}

	/** 은행 원본은 한쪽만 요구하고 상대 통장의 장부 이동을 같은 이체에 귀속합니다. */
	public static BankTransferPosting create(UUID id, UUID property, UUID source, UUID counterpartAccount,
	    UUID accountingAccount, UUID actor, OffsetDateTime at) {
		BankTransferPosting posting = new BankTransferPosting();
		posting.id = id;
		posting.propertyId = property;
		posting.sourceTransactionId = source;
		posting.counterpartAccountId = counterpartAccount;
		posting.accountingAccountId = accountingAccount;
		posting.createdBy = actor;
		posting.createdAt = at;
		return posting;
	}

	/** 뒤늦은 실제 원본만 연결하고 취소 상태는 유지합니다. 이미 확정한 다른 원본을 덮어쓰지 않습니다. */
	public void reconcile(UUID transaction) {
		if (counterpartTransactionId != null && !counterpartTransactionId.equals(transaction))
			throw new IllegalStateException("Transfer reconciliation conflict");
		counterpartTransactionId = transaction;
	}

	/** 취소 이력을 남겨 양쪽 장부 반영을 함께 해제하며 재시도로 되살리지 않습니다. */
	public void cancel(UUID actor, OffsetDateTime at) {
		if (canceledAt != null) return;
		canceledBy = actor;
		canceledAt = at;
	}
}
