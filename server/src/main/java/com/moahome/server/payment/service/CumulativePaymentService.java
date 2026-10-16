package com.moahome.server.payment.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Collectors;
import com.moahome.server.billing.domain.Charge;
import com.moahome.server.billing.repo.BillingPeriodRepository;
import com.moahome.server.billing.repo.ChargeRepository;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.payment.domain.*;
import com.moahome.server.payment.repo.*;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CumulativePaymentService {
    private final PaymentRepository payments;
    private final PaymentAllocationRepository allocations;
    private final PaymentEventRepository events;
    private final ChargeRepository charges;
    private final BillingPeriodRepository periods;
    private final PaymentTextSecurity security;
    private final Clock clock;

    public CumulativePaymentService(PaymentRepository payments,PaymentAllocationRepository allocations,PaymentEventRepository events,
        ChargeRepository charges,BillingPeriodRepository periods,@Lazy PaymentTextSecurity security,Clock clock) {
        this.payments=payments;this.allocations=allocations;this.events=events;this.charges=charges;
        this.periods=periods;this.security=security;this.clock=clock;
    }

    /** 호출자가 관리대상 잠금을 보유한 같은 트랜잭션에서 누적 입금을 미납 청구에 충당하고 남은 금액은 선입금으로 유지합니다. */
    @Transactional
    public void settle(UUID property,UUID actor) {
        var receipts=payments.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(property).stream()
            .filter(p->p.getDeletedAt()==null&&"CONFIRMED".equals(p.getStatus())&&"HOUSEHOLD".equals(p.getReceiptType()))
            .sorted(Comparator.comparing(Payment::getPaymentDate).thenComparing(Payment::getCreatedAt).thenComparing(Payment::getId)).toList();
        if (receipts.isEmpty()) return;
        var issued=periods.findByPropertyIdOrderByBillingYearDescBillingMonthDesc(property).stream()
            .filter(p->"ISSUED".equals(p.getStatus())).collect(Collectors.toMap(p->p.getId(),p->p));
        var targets=charges.findByPropertyId(property).stream()
            .filter(c->"ISSUED".equals(c.getStatus())&&c.getTotalAmount().signum()>0&&issued.containsKey(c.getBillingPeriodId()))
            .sorted(Comparator.comparing((Charge c)->issued.get(c.getBillingPeriodId()).month()).thenComparing(Charge::getId))
            .collect(Collectors.groupingBy(Charge::getUnitId));
        var saved=allocations.findByPropertyId(property).stream().filter(a->"ACTIVE".equals(a.getStatus())).toList();
        Map<UUID,BigDecimal> used=new HashMap<>(),paid=new HashMap<>();
        Map<String,PaymentAllocation> pairs=new HashMap<>();
        for(var allocation:saved) {
            used.merge(allocation.getPaymentId(),allocation.getAllocatedAmount(),BigDecimal::add);
            paid.merge(allocation.getChargeId(),allocation.getAllocatedAmount(),BigDecimal::add);
            pairs.put(allocation.getPaymentId()+":"+allocation.getChargeId(),allocation);
        }
        var at=OffsetDateTime.now(clock);
        for(var payment:receipts) {
            var left=payment.getAmount().subtract(used.getOrDefault(payment.getId(),BigDecimal.ZERO));
            if(left.signum()<=0) continue;
            // 청구월 순서는 장부 충당을 일관되게 계산하기 위한 기준이며 입금자의 납부 의도를 추정하지 않습니다.
            for(var charge:targets.getOrDefault(payment.getMatchedUnitId(),List.of())) {
                if(left.signum()<=0) break;
                var balance=charge.getTotalAmount().subtract(paid.getOrDefault(charge.getId(),BigDecimal.ZERO));
                if(balance.signum()<=0) continue;
                var amount=left.min(balance);
                var pair=payment.getId()+":"+charge.getId();
                var allocation=pairs.get(pair);
                var before=allocation==null?BigDecimal.ZERO:allocation.getAllocatedAmount();
                // 스케줄 충당의 책임자는 원 수납 확정자로 기록하고 별도 자동 충당 이벤트로 수동 확정과 구분합니다.
                UUID responsible=actor==null?payment.getConfirmedBy():actor;
                if(allocation==null) {
                    allocation=allocations.save(PaymentAllocation.allocate(payment,charge.getId(),amount,responsible,at));
                    pairs.put(pair,allocation);
                } else allocation.increase(amount);
                String detail="charge="+charge.getId()+",before="+before.toPlainString()+",added="+amount.toPlainString();
                events.save(PaymentEvent.record(payment,"CUMULATIVE_APPLIED",security.protect(detail).encrypted(),responsible,at));
                paid.merge(charge.getId(),amount,BigDecimal::add);
                left=left.subtract(amount);
            }
        }
        // 미납과 선입금 변경은 수납 확정·취소 또는 청구 생성과 함께 커밋하고 실패하면 모두 롤백합니다.
        allocations.flush();events.flush();
    }
}
