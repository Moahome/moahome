package com.moahome.server.payment.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Collectors;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.moahome.server.billing.domain.BillingPeriod;
import com.moahome.server.billing.domain.Charge;
import com.moahome.server.billing.domain.CreditApplication;
import com.moahome.server.billing.domain.OpeningBalanceBatch;
import com.moahome.server.billing.repo.BillingPeriodRepository;
import com.moahome.server.billing.repo.ChargeRepository;
import com.moahome.server.billing.repo.CreditApplicationRepository;
import com.moahome.server.billing.repo.OpeningBalanceBatchRepository;
import com.moahome.server.billing.repo.OpeningBalanceItemRepository;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.payment.domain.*;
import com.moahome.server.payment.repo.*;

@Service
public class CumulativePaymentService {
	private final PaymentRepository payments;

	private final PaymentAllocationRepository allocations;

	private final PaymentEventRepository events;

	private final ChargeRepository charges;

	private final BillingPeriodRepository periods;

	private final PaymentTextSecurity security;

	private final Clock clock;

	private final OpeningBalanceBatchRepository openingBatches;

	private final OpeningBalanceItemRepository openingItems;

	private final CreditApplicationRepository creditApplications;

	public CumulativePaymentService(PaymentRepository payments, PaymentAllocationRepository allocations,
	    PaymentEventRepository events, ChargeRepository charges, BillingPeriodRepository periods,
	    @Lazy PaymentTextSecurity security, Clock clock,
	    OpeningBalanceBatchRepository openingBatches,
	    OpeningBalanceItemRepository openingItems,
	    CreditApplicationRepository creditApplications) {
		this.payments = payments;
		this.allocations = allocations;
		this.events = events;
		this.charges = charges;
		this.periods = periods;
		this.security = security;
		this.clock = clock;
		this.openingBatches = openingBatches;
		this.openingItems = openingItems;
		this.creditApplications = creditApplications;
	}

	/** 호출자가 관리대상 잠금을 보유한 같은 트랜잭션에서 누적 입금을 미납 청구에 충당하고 남은 금액은 선입금으로 유지합니다. */
	@Transactional
	public void settle(UUID property, UUID actor) {
		List<Payment> receipts = payments.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(property).stream()
		    .filter(p -> p.getDeletedAt() == null && "CONFIRMED".equals(p.getStatus())
		        && "HOUSEHOLD".equals(p.getReceiptType()))
		    .sorted(Comparator.comparing(Payment::getPaymentDate).thenComparing(Payment::getCreatedAt)
		        .thenComparing(Payment::getId))
		    .toList();
		Map<UUID, BillingPeriod> issued = periods.findByPropertyIdOrderByBillingYearDescBillingMonthDesc(property)
		    .stream().filter(p -> "ISSUED".equals(p.getStatus())).collect(Collectors.toMap(p -> p.getId(), p -> p));
		Map<UUID, List<Charge>> targets = charges.findByPropertyId(property).stream()
		    .filter(c -> "ISSUED".equals(c.getStatus()) && c.getTotalAmount().signum() > 0
		        && ("OPENING_RECEIVABLE".equals(c.getChargeType()) || issued.containsKey(c.getBillingPeriodId())))
		    .sorted(Comparator.comparing((Charge c) -> "OPENING_RECEIVABLE".equals(c.getChargeType()) ? 0 : 1)
		        .thenComparing(Charge::getDueDate).thenComparing(Charge::getId))
		    .collect(Collectors.groupingBy(Charge::getUnitId));
		List<PaymentAllocation> saved = allocations.findByPropertyId(property).stream()
		    .filter(a -> "ACTIVE".equals(a.getStatus())).toList();
		Map<UUID, BigDecimal> used = new HashMap<>(), paid = new HashMap<>();
		Map<String, PaymentAllocation> pairs = new HashMap<>();
		for (var allocation : saved) {
			used.merge(allocation.getPaymentId(), allocation.getAllocatedAmount(), BigDecimal::add);
			paid.merge(allocation.getChargeId(), allocation.getAllocatedAmount(), BigDecimal::add);
			pairs.put(allocation.getPaymentId() + ":" + allocation.getChargeId(), allocation);
		}
		var at = OffsetDateTime.now(clock);
		// 기존 선납은 은행 수납을 만들지 않고 별도 충당으로 먼저 반영하며 양쪽 충당 합계가 청구액을 넘지 않게 합니다.
		List<CreditApplication> credits = creditApplications.findByPropertyId(property).stream()
		    .filter(a -> "ACTIVE".equals(a.getStatus())).toList();
		Map<UUID, BigDecimal> creditUsed = new HashMap<>();
		for (var credit : credits) {
			paid.merge(credit.getChargeId(), credit.getAmount(), BigDecimal::add);
			creditUsed.merge(credit.getOpeningItemId(), credit.getAmount(), BigDecimal::add);
		}
		Map<UUID, OpeningBalanceBatch> confirmed = openingBatches.findByPropertyIdOrderByCreatedAtDesc(property)
		    .stream().filter(b -> "CONFIRMED".equals(b.getStatus())).collect(Collectors.toMap(b -> b.getId(), b -> b));
		for (var source : openingItems.findByPropertyId(property)) {
			var batch = confirmed.get(source.getBatchId());
			if (batch == null)
				continue;
			var remaining = source.getCredit().subtract(creditUsed.getOrDefault(source.getId(), BigDecimal.ZERO));
			for (var charge : targets.getOrDefault(source.getUnitId(), List.of())) {
				if (remaining.signum() <= 0)
					break;
				var balance = charge.getTotalAmount().subtract(paid.getOrDefault(charge.getId(), BigDecimal.ZERO));
				if (balance.signum() <= 0)
					continue;
				var amount = remaining.min(balance);
				var existing = credits.stream()
				    .filter(a -> a.getOpeningItemId().equals(source.getId()) && a.getChargeId().equals(charge.getId()))
				    .findFirst();
				if (existing.isPresent())
					existing.get().increase(amount);
				else
					creditApplications.save(CreditApplication.apply(source, charge,
					    amount, actor == null ? batch.getConfirmedBy() : actor, at));
				paid.merge(charge.getId(), amount, BigDecimal::add);
				remaining = remaining.subtract(amount);
			}
		}
		creditApplications.flush();
		for (var payment : receipts) {
			var left = payment.getAmount().subtract(used.getOrDefault(payment.getId(), BigDecimal.ZERO));
			if (left.signum() <= 0)
				continue;
			// 청구월 순서는 장부 충당을 일관되게 계산하기 위한 기준이며 입금자의 납부 의도를 추정하지 않습니다.
			for (var charge : targets.getOrDefault(payment.getMatchedUnitId(), List.of())) {
				if (left.signum() <= 0)
					break;
				var balance = charge.getTotalAmount().subtract(paid.getOrDefault(charge.getId(), BigDecimal.ZERO));
				if (balance.signum() <= 0)
					continue;
				var amount = left.min(balance);
				var pair = payment.getId() + ":" + charge.getId();
				var allocation = pairs.get(pair);
				var before = allocation == null ? BigDecimal.ZERO : allocation.getAllocatedAmount();
				// 스케줄 충당의 책임자는 원 수납 확정자로 기록하고 별도 자동 충당 이벤트로 수동 확정과 구분합니다.
				UUID responsible = actor == null ? payment.getConfirmedBy() : actor;
				if (allocation == null) {
					allocation = allocations
					    .save(PaymentAllocation.allocate(payment, charge.getId(), amount, responsible, at));
					pairs.put(pair, allocation);
				} else
					allocation.increase(amount);
				String detail = "charge=" + charge.getId() + ",before=" + before.toPlainString() + ",added="
				    + amount.toPlainString();
				events.save(PaymentEvent.record(payment, "CUMULATIVE_APPLIED", security.protect(detail).encrypted(),
				    responsible, at));
				paid.merge(charge.getId(), amount, BigDecimal::add);
				left = left.subtract(amount);
			}
		}
		// 미납과 선입금 변경은 수납 확정·취소 또는 청구 생성과 함께 커밋하고 실패하면 모두 롤백합니다.
		allocations.flush();
		events.flush();
	}
}
