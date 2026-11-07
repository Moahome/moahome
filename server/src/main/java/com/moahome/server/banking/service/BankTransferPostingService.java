package com.moahome.server.banking.service;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;
import com.moahome.server.common.security.PaymentTextSecurity;
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
	private final BankingBalanceService balances;
	private final PaymentTextSecurity security;

	public BankTransferPostingService(BankTransferPostingRepository postings, BankTransactionRepository transactions,
	    BankAccountRepository accounts, AccountingAccountRepository accounting, BankTransferRepository legacy,
	    PaymentRepository payments, ExpenseRepository expenses, Clock clock,
	    BankTransferAllocationRepository allocationRepository, BuildingRepository buildings,
	    @Lazy BankingBalanceService balances, @Lazy PaymentTextSecurity security) {
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
		this.balances = balances;
		this.security = security;
	}

	public List<BankTransferPosting> all(UUID property) {
		return postings.findByPropertyId(property).stream().filter(value -> value.getDeletedAt() == null).toList();
	}


	/** 후보에는 실제로 도착해야 할 통장·방향을 명시해 수동 이체 양쪽 원본도 각각 한 번 대사합니다. */
	public record PendingTransfer(BankTransferPosting posting, UUID accountId, UUID otherAccountId,
		LocalDate date, String direction, BigDecimal amount) {
	}

	public List<PendingTransfer> pendingTransfers(UUID property) {
		Map<UUID, BankTransaction> originals = originals(property);
		List<PendingTransfer> result = new ArrayList<>();
		for (BankTransferPosting posting : all(property)) {
			if (posting.isManual()) {
				if (posting.getSourceTransactionId() == null)
					result.add(new PendingTransfer(posting, posting.getManualOutgoingAccountId(), posting.getCounterpartAccountId(),
						posting.getManualDate(), "EXPENSE", posting.getManualAmount()));
				if (posting.getCounterpartTransactionId() == null)
					result.add(new PendingTransfer(posting, posting.getCounterpartAccountId(), posting.getManualOutgoingAccountId(),
						posting.getManualDate(), "INCOME", posting.getManualAmount()));
				continue;
			}
			BankTransaction source = originals.get(posting.getSourceTransactionId());
			if (posting.getCounterpartTransactionId() == null && source != null && source.getDeletedAt() == null)
				result.add(new PendingTransfer(posting, posting.getCounterpartAccountId(), source.getBankAccountId(),
					source.getTransactionDate(), "INCOME".equals(source.getDirection()) ? "EXPENSE" : "INCOME", source.getAmount()));
		}
		return result;
	}

	/** 같은 통장·날짜·방향·금액의 유일한 후보만 제안하며 복수 후보는 관리자가 확인합니다. */
	public PendingTransfer pending(List<PendingTransfer> candidates, UUID account, LocalDate date,
		String direction, BigDecimal amount) {
		List<PendingTransfer> matches = candidates.stream().filter(value -> account.equals(value.accountId())
			&& date.equals(value.date()) && direction.equals(value.direction()) && amount.compareTo(value.amount()) == 0).toList();
		if (matches.size() > 1) throw new PaymentException("BANK_TRANSFER_MATCH_AMBIGUOUS");
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
			UUID other;
			if (source.getId().equals(previous.getSourceTransactionId())) other = previous.getCounterpartAccountId();
			else if (previous.isManual()) other = previous.getManualOutgoingAccountId();
			else other = transactions.findById(previous.getSourceTransactionId()).orElseThrow().getBankAccountId();
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
			UUID otherAccount = match.otherAccountId();
			if ((expectedMatch != null && !expectedMatch.equals(pending.getId()))
			    || (counterpartAccount != null && !counterpartAccount.equals(otherAccount)))
				throw new PaymentException("BANK_TRANSFER_CONFLICT");
			source.markTransferCandidate();
			transactions.flush();
			if (pending.isManual()) pending.reconcileManual(source);
			else pending.reconcile(source.getId());
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

	/** 요청 ID와 본문을 대조해 재시도는 한 건으로 반환하고 실제 출금 통장의 자금만 이동합니다. */
	public BankTransferPosting manual(UUID property, BankingRequests.ManualTransfer request, UUID actor) {
		BankTransferPosting previous = postings.findById(request.id()).orElse(null);
		if (previous != null) {
			if (!property.equals(previous.getPropertyId()) || !previous.isManual() || !actor.equals(previous.getCreatedBy())
				|| !request.fromAccountId().equals(previous.getManualOutgoingAccountId())
				|| !request.toAccountId().equals(previous.getCounterpartAccountId())
				|| !request.date().equals(previous.getManualDate())
				|| new BigDecimal(request.amount()).compareTo(previous.getManualAmount()) != 0
				|| !Objects.equals(request.note(), previous.getManualMemoEncrypted() == null ? null : security.decrypt(previous.getManualMemoEncrypted()))
				|| !allocations(property, previous.getId()).equals(request.allocations().stream()
					.map(value -> new BankingRequests.TransferAllocation(value.buildingId(), new BigDecimal(value.amount()).toPlainString()))
					.sorted(Comparator.comparing(value -> value.buildingId().toString())).toList()))
				throw new PaymentException("BANK_REQUEST_CONFLICT");
			return previous;
		}
		if (transactions.existsById(request.id())) throw new PaymentException("BANK_REQUEST_CONFLICT");
		if (request.fromAccountId().equals(request.toAccountId()) || new BigDecimal(request.amount()).signum() <= 0
			|| request.date().isAfter(LocalDate.now(clock.withZone(ZoneId.of("Asia/Seoul")))))
			throw new PaymentException("INVALID_MANUAL_TRANSFER");
		for (UUID account : List.of(request.fromAccountId(), request.toAccountId()))
			accounts.findById(account).filter(value -> property.equals(value.getPropertyId()) && value.getDeletedAt() == null
				&& value.getBuildingId() == null && value.getStatus() == BankAccountStatus.ACTIVE)
				.orElseThrow(() -> new PaymentException("INVALID_TRANSFER_ACCOUNT"));
		// 이미 가져온 동일 원본이 있으면 새 수동 이동을 만들지 않고 기존 거래에서 이체로 설정하게 합니다.
		if (originals(property).values().stream().anyMatch(value -> value.getDeletedAt() == null
			&& request.date().equals(value.getTransactionDate()) && value.getAmount().compareTo(new BigDecimal(request.amount())) == 0
			&& ((request.fromAccountId().equals(value.getBankAccountId()) && "EXPENSE".equals(value.getDirection()))
				|| (request.toAccountId().equals(value.getBankAccountId()) && "INCOME".equals(value.getDirection())))))
			throw new PaymentException("BANK_TRANSFER_EXISTING_TRANSACTION");
		BankingResponse.TransferFunds funds = balances.transferFunds(actor, property, request.fromAccountId(), request.date());
		if (funds.accountAvailable() == null) throw new PaymentException("BANK_TRANSFER_BALANCE_REQUIRED");
		if (new BigDecimal(request.amount()).compareTo(new BigDecimal(funds.accountAvailable()).max(BigDecimal.ZERO)) > 0)
			throw new PaymentException("BANK_TRANSFER_BALANCE_EXCEEDED");
		if (buildings.findByPropertyId(property).stream().anyMatch(value -> value.getDeletedAt() == null
			&& value.getStatus() == BuildingStatus.ACTIVE) && request.allocations().isEmpty())
			throw new PaymentException("INVALID_TRANSFER_ALLOCATION");
		BankTransferPosting posting = BankTransferPosting.manual(request.id(), property, request.fromAccountId(), request.toAccountId(),
			request.date(), new BigDecimal(request.amount()), request.note() == null ? null : security.protect(request.note()).encrypted(),
			transferAccount(property, actor), actor, OffsetDateTime.now(clock));

		transactions.flush();
		postings.saveAndFlush(posting);
		if (!request.allocations().isEmpty()) attach(posting, request.allocations(), actor);
		return posting;
	}

	/** 수동 이체도 기존 원본이 있으면 표시 ID만 대체하고 실제 현금은 이체 한 건에서 한 번만 계산합니다. */
	public List<BankingResponse.Transaction> manualRows(UUID property) {
		List<BankingResponse.Transaction> result = new ArrayList<>();
		for (BankTransferPosting posting : all(property)) {
			if (!posting.isManual()) continue;
			String status = posting.getCanceledAt() == null ? "TRANSFER" : "CANCELED";
			String memo = posting.getManualMemoEncrypted() == null ? null : security.decrypt(posting.getManualMemoEncrypted());
			for (String direction : List.of("EXPENSE", "INCOME")) {
				boolean outgoing = "EXPENSE".equals(direction);
				result.add(new BankingResponse.Transaction(outgoing ? posting.outgoingDisplayId() : posting.incomingDisplayId(),
					outgoing ? posting.getManualOutgoingAccountId() : posting.getCounterpartAccountId(), posting.getManualDate(),
					null, "통장간 거래", memo, posting.getManualAmount().toPlainString(), null, direction, "", null, status,
					"", "", null, null, null, true, posting.getId(), "TRANSFER_MANUAL",
					outgoing ? posting.getCounterpartAccountId() : posting.getManualOutgoingAccountId(), true, allocations(property, posting.getId())));
			}
		}
		return result;
	}

	/** 수동 이체에 대사된 은행 원본은 이체의 투영과 중복 합산하지 않습니다. */
	public Set<UUID> manualSources(UUID property) {
		Set<UUID> result = new HashSet<>();
		for (BankTransferPosting posting : all(property)) {
			if (!posting.isManual()) continue;
			if (posting.getSourceTransactionId() != null) result.add(posting.getSourceTransactionId());
			if (posting.getCounterpartTransactionId() != null) result.add(posting.getCounterpartTransactionId());
		}
		return result;
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
		BankTransaction source = posting.isManual() ? null : transactions.findById(posting.getSourceTransactionId()).orElseThrow();
		BigDecimal expected = posting.isManual() ? posting.getManualAmount() : source.getAmount();
		Set<UUID> ids = new HashSet<>();
		BigDecimal total = BigDecimal.ZERO;
		for (BankingRequests.TransferAllocation part : input) {
			BigDecimal amount = new BigDecimal(part.amount());
			if (amount.signum() <= 0 || !ids.add(part.buildingId()) || buildings.findById(part.buildingId())
			    .filter(value -> posting.getPropertyId().equals(value.getPropertyId()) && value.getDeletedAt() == null
			        && value.getStatus() == BuildingStatus.ACTIVE).isEmpty()) throw new PaymentException("INVALID_TRANSFER_ALLOCATION");
			total = total.add(amount);
		}
		if (total.compareTo(expected) != 0) throw new PaymentException("BANK_TRANSFER_ALLOCATION_MISMATCH");
		// 입금 원본으로 설정해도 한도는 상대 출금 통장의 동별 소유금입니다. 관리대상 잠금 안에서 매번 재조회합니다.
		UUID outgoingAccount = outgoingAccount(posting, source);
		Map<UUID, BigDecimal> available = balances.transferBalances(actor, posting.getPropertyId(), outgoingAccount,
			(posting.isManual() ? posting.getManualDate() : source.getTransactionDate()));
		for (BankingRequests.TransferAllocation part : input) {
			BigDecimal limit = available.get(part.buildingId());
			if (limit == null)
				throw new PaymentException("BANK_TRANSFER_BALANCE_REQUIRED");
			if (new BigDecimal(part.amount()).compareTo(limit.max(BigDecimal.ZERO)) > 0)
				throw new PaymentException("BANK_TRANSFER_BALANCE_EXCEEDED");
		}
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
			if (!posting.isManual() && (source == null || source.getDeletedAt() != null)) continue;
			UUID from = outgoingAccount(posting, source);
			UUID to = incomingAccount(posting, source);
			String amount = part.getAmount().toPlainString();
			LocalDate date = posting.isManual() ? posting.getManualDate() : source.getTransactionDate();
			LocalTime time = posting.isManual() ? null : source.getTransactionTime();
			UUID sourceId = posting.isManual() ? posting.outgoingDisplayId() : source.getId();
			result.add(new BankingBalanceResponse.Entry(part.getId(), part.getBuildingId(), date,
			    time, "통장간 거래 · 출금", "0", amount, null, from, sourceId));
			UUID incoming = UUID.nameUUIDFromBytes(("transfer-in:" + part.getId()).getBytes(StandardCharsets.UTF_8));
			result.add(new BankingBalanceResponse.Entry(incoming, part.getBuildingId(), date,
			    time, "통장간 거래 · 입금", amount, "0", null, to, sourceId));
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
		for (BankTransferPosting posting : postings.findByPropertyId(property)) {
			if (posting.isManual()) {
				if (!requested.contains(posting.outgoingDisplayId()) && !requested.contains(posting.incomingDisplayId())) continue;
				if (posting.getCanceledAt() == null) throw new PaymentException("BANK_TRANSFER_CANCEL_REQUIRED");
				if (!requested.contains(posting.outgoingDisplayId()) || !requested.contains(posting.incomingDisplayId()))
					throw new PaymentException("BANK_TRANSFER_DELETE_PAIR_REQUIRED");
				ids.remove(posting.outgoingDisplayId());
				ids.remove(posting.incomingDisplayId());
				if (posting.getSourceTransactionId() != null) ids.add(posting.getSourceTransactionId());
				if (posting.getCounterpartTransactionId() != null) ids.add(posting.getCounterpartTransactionId());
				continue;
			}
			if (posting.getCanceledAt() == null || !(requested.contains(posting.getId())
				|| requested.contains(posting.getSourceTransactionId()) || requested.contains(posting.getCounterpartTransactionId()))) continue;
			if (posting.getCounterpartTransactionId() != null && (!requested.contains(posting.getSourceTransactionId())
				|| !requested.contains(posting.getCounterpartTransactionId())))
				throw new PaymentException("BANK_TRANSFER_DELETE_PAIR_REQUIRED");
			ids.remove(posting.getId());
			ids.add(posting.getSourceTransactionId());
			if (posting.getCounterpartTransactionId() != null) ids.add(posting.getCounterpartTransactionId());
		}
		return ids;
	}

	/** 소속·취소·양쪽 선택은 삭제 원본 해석에서 먼저 검사하고 같은 트랜잭션에서 숨김 감사를 기록합니다. */
	public void removeManualSelections(UUID property, Set<UUID> requested, UUID actor, OffsetDateTime at) {
		for (BankTransferPosting posting : postings.findByPropertyId(property))
			if (posting.isManual() && requested.contains(posting.outgoingDisplayId()) && requested.contains(posting.incomingDisplayId()))
				posting.removeManual(actor, at);
		postings.flush();
	}

	public Set<UUID> canceledSources(UUID property) {
		Set<UUID> ids = new HashSet<>();
		all(property).stream().filter(value -> value.getCanceledAt() != null).forEach(value -> {
			if (value.getSourceTransactionId() != null) ids.add(value.getSourceTransactionId());
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
			if (posting.isManual()) continue;
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
		for (BankingResponse.Transaction manual : manualRows(property)) {
			BankingResponse.Transaction actual = byId.get(manual.id());
			if (actual == null) result.add(manual);
			else result.replaceAll(value -> value.id().equals(manual.id())
				? transferRow(value, all(property).stream().filter(posting -> posting.getId().equals(manual.transferId())).findFirst().orElseThrow(),
					manual.transferAccountId(), manual.status()) : value);
		}
		return result;
	}

	private BankingResponse.Transaction transferRow(BankingResponse.Transaction value, BankTransferPosting posting,
	    UUID counterpartAccount, String status) {
		return new BankingResponse.Transaction(value.id(), value.accountId(), value.date(), value.time(), value.payer(),
		    value.memo(), value.amount(), value.balance(), value.direction(), value.ruleKey(), null, status, "", "", null,
		    null, null, true, posting.getId(), value.sourceType(), counterpartAccount, true, allocations(posting.getPropertyId(), posting.getId()));
	}

	private UUID outgoingAccount(BankTransferPosting posting, BankTransaction source) {
		if (posting.isManual()) return posting.getManualOutgoingAccountId();
		return "EXPENSE".equals(source.getDirection()) ? source.getBankAccountId() : posting.getCounterpartAccountId();
	}

	private UUID incomingAccount(BankTransferPosting posting, BankTransaction source) {
		if (posting.isManual()) return posting.getCounterpartAccountId();
		return "INCOME".equals(source.getDirection()) ? source.getBankAccountId() : posting.getCounterpartAccountId();
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
