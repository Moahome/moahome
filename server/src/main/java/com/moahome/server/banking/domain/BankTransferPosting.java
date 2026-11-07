package com.moahome.server.banking.domain;

import java.time.OffsetDateTime;
import java.time.LocalDate;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
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
	private UUID manualOutgoingAccountId;
	private LocalDate manualDate;
	@Column(precision = 15, scale = 0)
	private BigDecimal manualAmount;
	@Column(columnDefinition = "text")
	private String manualMemoEncrypted;
	private UUID deletedBy;
	private OffsetDateTime deletedAt;

	public boolean isManual() {
		return manualOutgoingAccountId != null;
	}

	/** 은행 원본이 없으면 이체에서 표시 ID만 파생하며 실제 원본 연결 후에도 이체 ID는 유지합니다. */
	public UUID outgoingDisplayId() {
		return sourceTransactionId == null ? id : sourceTransactionId;
	}

	public UUID incomingDisplayId() {
		return counterpartTransactionId == null
			? UUID.nameUUIDFromBytes(("manual-transfer-in:" + id).getBytes(StandardCharsets.UTF_8)) : counterpartTransactionId;
	}

	/** 수동 이체 본문을 한 건으로 저장하고 수납·비용·은행 거래는 만들지 않습니다. */
	public static BankTransferPosting manual(UUID id, UUID property, UUID from, UUID to, LocalDate date,
		BigDecimal amount, String memo, UUID accountingAccount, UUID actor, OffsetDateTime at) {
		BankTransferPosting posting = create(id, property, null, to, accountingAccount, actor, at);
		posting.manualOutgoingAccountId = from;
		posting.manualDate = date;
		posting.manualAmount = amount;
		posting.manualMemoEncrypted = memo;
		return posting;
	}

	/** 뒤늦은 은행 원본의 각 방향을 최초 한 번 연결하며 수동 이체를 새로 반영하지 않습니다. */
	public void reconcileManual(BankTransaction source) {
		if ("EXPENSE".equals(source.getDirection())) {
			if (sourceTransactionId != null && !sourceTransactionId.equals(source.getId()))
				throw new IllegalStateException("Transfer reconciliation conflict");
			sourceTransactionId = source.getId();
			return;
		}
		reconcile(source.getId());
	}

	/** 사용자가 먼저 취소한 수동 이체만 양쪽 표시 행과 함께 숨기고 감사 이력은 남깁니다. */
	public void removeManual(UUID actor, OffsetDateTime at) {
		if (!isManual() || canceledAt == null)
			throw new IllegalStateException("Cancel transfer before deletion");
		if (deletedAt != null) return;
		deletedBy = actor;
		deletedAt = at;
	}

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
