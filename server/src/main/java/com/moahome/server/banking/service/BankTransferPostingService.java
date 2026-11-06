package com.moahome.server.banking.service;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import com.moahome.server.accounting.domain.*;
import com.moahome.server.accounting.repo.AccountingAccountRepository;
import com.moahome.server.banking.domain.*;
import com.moahome.server.banking.dto.BankingResponse;
import com.moahome.server.banking.dto.BankingRequests;
import com.moahome.server.banking.dto.BankingBalanceResponse;
import com.moahome.server.property.repo.BuildingRepository;
import com.moahome.server.property.domain.BuildingStatus;
import com.moahome.server.banking.repo.*;
import com.moahome.server.expense.repo.ExpenseRepository;
import com.moahome.server.payment.repo.PaymentRepository;
import com.moahome.server.payment.exception.PaymentException;

@Service
public class BankTransferPostingService {
	private final BankTransferPostingRepository postings;
	private final BankTransactionRepository transactions;
	private final BankAccountRepository accounts;
	private final AccountingAccountRepository accounting;
	private final BankTransferRepository legacy;
	private final PaymentRepository payments;
	private final ExpenseRepository expenses;
	private final Clock clock;
	private final BankTransferAllocationRepository allocationRepository;
	private final BuildingRepository buildings;

	public BankTransferPostingService(BankTransferPostingRepository postings, BankTransactionRepository transactions,
	    BankAccountRepository accounts, AccountingAccountRepository accounting, BankTransferRepository legacy,
	    PaymentRepository payments, ExpenseRepository expenses, Clock clock,
	    BankTransferAllocationRepository allocationRepository, BuildingRepository buildings) {
		this.postings = postings;
		this.transactions = transactions;
		this.accounts = accounts;
		this.accounting = accounting;
		this.legacy = legacy;
		this.payments = payments;
		this.expenses = expenses;
		this.clock = clock;
		this.allocationRepository = allocationRepository;
		this.buildings = buildings;
	}

	public List<BankTransferPosting> all(UUID property) {
		return postings.findByPropertyId(property);
	}

	/** 미대사 이체와 은행 원본을 함께 읽은 미리보기 스냅샷입니다. */
	public record PendingTransfer(BankTransferPosting posting, BankTransaction source) {
	}

	/** 파일 전체에서 한 번 조회하며 취소 이체도 원본 대사만 허용해 재수입으로 되살리지 않습니다. */
	public List<PendingTransfer> pendingTransfers(UUID property) {
		Map<UUID, BankTransaction> originals = originals(property);
		return all(property).stream()
		    .filter(value -> value.getCounterpartTransactionId() == null)
		    .map(value -> new PendingTransfer(value, originals.get(value.getSourceTransactionId())))
		    .filter(value -> value.source() != null && value.source().getDeletedAt() == null).toList();
	}

	/** 통장·날짜·금액·방향이 일치하는 미연결 이체만 제안하며 복수 후보는 임의 선택하지 않습니다. */
	public PendingTransfer pending(List<PendingTransfer> candidates, UUID account, LocalDate date,
	    String direction, BigDecimal amount) {
		List<PendingTransfer> matches = candidates.stream()
		    .filter(value -> account.equals(value.posting().getCounterpartAccountId())
		        && value.source().getTransactionDate().equals(date)
		        && !value.source().getDirection().equals(direction) && value.source().getAmount().compareTo(amount) == 0)
		    .toList();
		if (matches.size() > 1)
			throw new PaymentException("BANK_TRANSFER_MATCH_AMBIGUOUS");
		return matches.isEmpty() ? null : matches.getFirst();
	}

	/** 호출자가 관리대상 권한·행 잠금을 확보한 뒤 등록·대사·103 연결을 같은 트랜잭션으로 저장합니다. */
	public BankTransferPosting record(UUID id, BankTransaction source, UUID counterpartAccount, UUID expectedMatch, UUID actor) {
		return record(id, source, counterpartAccount, expectedMatch, actor, null);
	}

	/** 통장·동별 귀속은 같은 잠금·트랜잭션 안에서 전액을 함께 저장합니다. */
	public BankTransferPosting record(UUID id, BankTransaction source, UUID counterpartAccount, UUID expectedMatch,
	    UUID actor, List<BankingRequests.TransferAllocation> allocationInput) {
		UUID property = source.getPropertyId();
		List<BankTransferPosting> current = all(property);
		BankTransferPosting previous = current.stream().filter(value -> source.getId().equals(value.getSourceTransactionId())
		    || source.getId().equals(value.getCounterpartTransactionId())).findFirst().orElse(null);
		if (previous != null) {
			UUID other = source.getId().equals(previous.getSourceTransactionId()) ? previous.getCounterpartAccountId()
			    : transactions.findById(previous.getSourceTransactionId()).orElseThrow().getBankAccountId();
			if ((counterpartAccount != null && !counterpartAccount.equals(other))
			    || (expectedMatch != null && !expectedMatch.equals(previous.getId())))
				throw new PaymentException("BANK_REQUEST_CONFLICT");
			attach(previous, allocationInput, actor);
			return previous;
		}
		if (postings.existsById(id))
			throw new PaymentException("BANK_REQUEST_CONFLICT");
		requireUnassigned(source);
		PendingTransfer match = pending(pendingTransfers(property), source.getBankAccountId(), source.getTransactionDate(),
		    source.getDirection(), source.getAmount());
		BankTransferPosting pending = match == null ? null : match.posting();
		if (pending != null) {
			BankTransaction anchor = transactions.findById(pending.getSourceTransactionId()).orElseThrow();
			if ((expectedMatch != null && !expectedMatch.equals(pending.getId()))
			    || (counterpartAccount != null && !counterpartAccount.equals(anchor.getBankAccountId())))
				throw new PaymentException("BANK_TRANSFER_CONFLICT");
			source.markTransferCandidate();
			transactions.flush();
			pending.reconcile(source.getId());
			postings.saveAndFlush(pending);
			attach(pending, allocationInput, actor);
			return pending;
		}
		if (expectedMatch != null) throw new PaymentException("BANK_TRANSFER_CONFLICT");
		if (counterpartAccount == null || counterpartAccount.equals(source.getBankAccountId()))
			throw new PaymentException("INVALID_TRANSFER_ACCOUNT");
		accounts.findById(counterpartAccount).filter(value -> property.equals(value.getPropertyId())
		    && value.getDeletedAt() == null && value.getBuildingId() == null && value.getStatus() == BankAccountStatus.ACTIVE)
		    .orElseThrow(() -> new PaymentException("INVALID_TRANSFER_ACCOUNT"));
		BankTransferPosting posting = BankTransferPosting.create(id, property, source.getId(), counterpartAccount,
		    transferAccount(property, actor), actor, OffsetDateTime.now(clock));
		// 상대 원본이 먼저 등록된 경우 이미 분류한 거래는 바꾸지 않고 유일한 미분류 원본만 대사합니다.
		List<BankTransaction> candidates = originals(property).values().stream()
		    .filter(value -> value.getDeletedAt() == null && counterpartAccount.equals(value.getBankAccountId())
		        && value.getTransactionDate().equals(source.getTransactionDate())
		        && !value.getDirection().equals(source.getDirection()) && value.getAmount().compareTo(source.getAmount()) == 0).toList();
		if (candidates.size() > 1) throw new PaymentException("BANK_TRANSFER_MATCH_AMBIGUOUS");
		if (!candidates.isEmpty()) {
			BankTransaction counterpart = candidates.getFirst();
			requireUnassigned(counterpart);
			counterpart.markTransferCandidate();
			posting.reconcile(counterpart.getId());
		}
		source.markTransferCandidate();
		transactions.flush();
		postings.saveAndFlush(posting);
		attach(posting, allocationInput, actor);
		return posting;
	}

	/** 이미 등록한 이체에도 귀속 누락분을 한 번 확정할 수 있으며 기존 금액을 덮어쓰지 않습니다. */
	public void allocate(UUID property, UUID transfer, List<BankingRequests.TransferAllocation> input, UUID actor) {
		BankTransferPosting posting = postings.findById(transfer).filter(value -> property.equals(value.getPropertyId()))
		    .orElseThrow(() -> new PaymentException("BANK_TRANSFER_CONFLICT"));
		attach(posting, input, actor);
	}

	public List<BankingRequests.TransferAllocation> allocations(UUID property, UUID transfer) {
		return allocationRepository.findByPropertyId(property).stream().filter(value -> transfer.equals(value.getTransferId()))
		    .sorted(Comparator.comparing(value -> value.getBuildingId().toString()))
		    .map(value -> new BankingRequests.TransferAllocation(value.getBuildingId(), value.getAmount().toPlainString())).toList();
	}

	/** 전체 합계와 실제 소속 동을 검증하고 일부만 반영되거나 취소 이체에 귀속이 생기지 않게 합니다. */
	private void attach(BankTransferPosting posting, List<BankingRequests.TransferAllocation> input, UUID actor) {
		if (input == null) return;
		List<BankingRequests.TransferAllocation> existing = allocations(posting.getPropertyId(), posting.getId());
		List<BankingRequests.TransferAllocation> sorted = input.stream()
		    .map(value -> new BankingRequests.TransferAllocation(value.buildingId(), new BigDecimal(value.amount()).toPlainString()))
		    .sorted(Comparator.comparing(value -> value.buildingId().toString())).toList();
		if (!existing.isEmpty()) {
			if (!existing.equals(sorted)) throw new PaymentException("BANK_TRANSFER_ALLOCATION_CONFLICT");
			return;
		}
		if (posting.getCanceledAt() != null || input.isEmpty()) throw new PaymentException("BANK_TRANSFER_ALLOCATION_CONFLICT");
		BankTransaction source = transactions.findById(posting.getSourceTransactionId()).orElseThrow();
		Set<UUID> ids = new HashSet<>();
		BigDecimal total = BigDecimal.ZERO;
		for (BankingRequests.TransferAllocation part : input) {
			BigDecimal amount = new BigDecimal(part.amount());
			if (amount.signum() <= 0 || !ids.add(part.buildingId()) || buildings.findById(part.buildingId())
			    .filter(value -> posting.getPropertyId().equals(value.getPropertyId()) && value.getDeletedAt() == null
			        && value.getStatus() == BuildingStatus.ACTIVE).isEmpty()) throw new PaymentException("INVALID_TRANSFER_ALLOCATION");
			total = total.add(amount);
		}
		if (total.compareTo(source.getAmount()) != 0) throw new PaymentException("BANK_TRANSFER_ALLOCATION_MISMATCH");
		OffsetDateTime at = OffsetDateTime.now(clock);
		allocationRepository.saveAllAndFlush(input.stream().map(part -> BankTransferAllocation.create(posting.getPropertyId(),
		    posting.getId(), part.buildingId(), new BigDecimal(part.amount()), actor, at)).toList());
	}

	/** 같은 동의 소유금에 출금·입금 두 행을 투영하므로 전체 소유금은 보존되고 취소 시 함께 사라집니다. */
	public List<BankingBalanceResponse.Entry> buildingEntries(UUID property) {
		Map<UUID, BankTransferPosting> active = new HashMap<>();
		all(property).stream().filter(value -> value.getCanceledAt() == null).forEach(value -> active.put(value.getId(), value));
		Map<UUID, BankTransaction> sources = originals(property);
		List<BankingBalanceResponse.Entry> result = new ArrayList<>();
		for (BankTransferAllocation part : allocationRepository.findByPropertyId(property)) {
			BankTransferPosting posting = active.get(part.getTransferId());
			if (posting == null) continue;
			BankTransaction source = sources.get(posting.getSourceTransactionId());
			if (source == null || source.getDeletedAt() != null) continue;
			UUID from = "EXPENSE".equals(source.getDirection()) ? source.getBankAccountId() : posting.getCounterpartAccountId();
			UUID to = "INCOME".equals(source.getDirection()) ? source.getBankAccountId() : posting.getCounterpartAccountId();
			String amount = part.getAmount().toPlainString();
			result.add(new BankingBalanceResponse.Entry(part.getId(), part.getBuildingId(), source.getTransactionDate(),
			    source.getTransactionTime(), "통장간 거래 · 출금", "0", amount, null, from, source.getId()));
			UUID incoming = UUID.nameUUIDFromBytes(("transfer-in:" + part.getId()).getBytes(StandardCharsets.UTF_8));
			result.add(new BankingBalanceResponse.Entry(incoming, part.getBuildingId(), source.getTransactionDate(),
			    source.getTransactionTime(), "통장간 거래 · 입금", amount, "0", null, to, source.getId()));
		}
		return result;
	}

	/** 이미 수납·비용·다른 이체에 사용한 원본은 자동 이동으로 바꾸지 않습니다. */
	public void requireUnassigned(BankTransaction source) {
		if (source.getDeletedAt() != null
		    || payments.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(source.getPropertyId()).stream()
		        .anyMatch(value -> source.getId().equals(value.getBankTransactionId()))
		    || expenses.findByBankTransactionId(source.getId()).isPresent()
		    || legacy.findByPropertyId(source.getPropertyId()).stream().anyMatch(value -> value.getCanceledAt() == null
		        && (source.getId().equals(value.getOutgoingId()) || source.getId().equals(value.getIncomingId())))
		    || all(source.getPropertyId()).stream().anyMatch(value -> source.getId().equals(value.getSourceTransactionId())
		        || source.getId().equals(value.getCounterpartTransactionId())))
			throw new PaymentException("BANK_TRANSFER_CONFLICT");
	}

	/** 기존 은행 원본을 보존하며 취소한 이체의 양쪽 장부 반영만 함께 제외합니다. */
	public boolean cancel(UUID property, UUID id, UUID actor) {
		BankTransferPosting posting = postings.findById(id).filter(value -> property.equals(value.getPropertyId())).orElse(null);
		if (posting == null) return false;
		posting.cancel(actor, OffsetDateTime.now(clock));
		postings.flush();
		return true;
	}

	/** 취소된 자동 이체의 표시 행을 삭제하면 같은 이체의 양쪽 원본을 함께 보관 삭제합니다. */
	public Set<UUID> deletionSources(UUID property, Set<UUID> requested) {
		Set<UUID> ids = new LinkedHashSet<>(requested);
		for (BankTransferPosting posting : all(property)) {
			if (posting.getCanceledAt() == null || !(requested.contains(posting.getId())
			    || requested.contains(posting.getSourceTransactionId()) || requested.contains(posting.getCounterpartTransactionId()))) continue;
			ids.remove(posting.getId());
			ids.add(posting.getSourceTransactionId());
			if (posting.getCounterpartTransactionId() != null) ids.add(posting.getCounterpartTransactionId());
		}
		return ids;
	}

	public Set<UUID> canceledSources(UUID property) {
		Set<UUID> ids = new HashSet<>();
		all(property).stream().filter(value -> value.getCanceledAt() != null).forEach(value -> {
			ids.add(value.getSourceTransactionId());
			if (value.getCounterpartTransactionId() != null) ids.add(value.getCounterpartTransactionId());
		});
		return ids;
	}

	/** 실제 상대 원본이 없을 때만 자동 장부 행을 생성하고, 원본 도착 시 같은 금액을 중복 합산하지 않습니다. */
	public List<BankingResponse.Transaction> decorate(UUID property, List<BankingResponse.Transaction> rows) {
		List<BankingResponse.Transaction> result = new ArrayList<>(rows);
		Map<UUID, BankingResponse.Transaction> byId = new HashMap<>();
		rows.forEach(value -> byId.put(value.id(), value));
		for (BankTransferPosting posting : all(property)) {
			BankingResponse.Transaction source = byId.get(posting.getSourceTransactionId());
			if (source == null) continue;
			String status = posting.getCanceledAt() == null ? "TRANSFER" : "CANCELED";
			result.replaceAll(value -> value.id().equals(posting.getSourceTransactionId())
			    ? transferRow(value, posting, posting.getCounterpartAccountId(), status)
			    : value.id().equals(posting.getCounterpartTransactionId()) ? transferRow(value, posting, source.accountId(), status) : value);
			if (posting.getCounterpartTransactionId() == null) {
				result.add(new BankingResponse.Transaction(posting.getId(), posting.getCounterpartAccountId(), source.date(),
				    source.time(), "통장간 거래", "상대 통장 자동 반영", source.amount(), null,
				    "INCOME".equals(source.direction()) ? "EXPENSE" : "INCOME", "", null, status, "", "", null, null, null,
				    true, posting.getId(), "TRANSFER_AUTO", source.accountId(), true, allocations(property, posting.getId())));
			}
		}
		return result;
	}

	private BankingResponse.Transaction transferRow(BankingResponse.Transaction value, BankTransferPosting posting,
	    UUID counterpartAccount, String status) {
		return new BankingResponse.Transaction(value.id(), value.accountId(), value.date(), value.time(), value.payer(),
		    value.memo(), value.amount(), value.balance(), value.direction(), value.ruleKey(), null, status, "", "", null,
		    null, null, true, posting.getId(), value.sourceType(), counterpartAccount, true, allocations(posting.getPropertyId(), posting.getId()));
	}

	private Map<UUID, BankTransaction> originals(UUID property) {
		Map<UUID, BankTransaction> result = new HashMap<>();
		transactions.findByPropertyId(property).forEach(value -> result.put(value.getId(), value));
		return result;
	}

	/** 103은 비용이 아닌 자산 이동 계정으로 연결하며 회계 시작 기준은 자동 생성하지 않습니다. */
	private UUID transferAccount(UUID property, UUID actor) {
		AccountingAccount existing = accounting.findByPropertyIdOrderByCreatedAtAscIdAsc(property).stream()
		    .filter(value -> "103".equals(value.getCode())).findFirst().orElse(null);
		if (existing != null) {
			if (existing.getReportGroup() != IncomeGroup.ASSET || !"통장간 거래".equals(existing.getName()))
				throw new PaymentException("BANK_TRANSFER_ACCOUNT_CONFLICT");
			return existing.getId();
		}
		return accounting.saveAndFlush(AccountingAccount.create(property, "103", "통장간 거래", IncomeGroup.ASSET,
		    null, actor, OffsetDateTime.now(clock))).getId();
	}
}
