package com.moahome.server.banking.service;

import java.time.*;
import java.util.*;
import com.moahome.server.banking.domain.IncomeAllocation;
import com.moahome.server.banking.dto.BankingRequests;
import com.moahome.server.banking.repo.*;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.payment.domain.Payment;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.property.domain.BuildingStatus;
import com.moahome.server.property.repo.BuildingRepository;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 수동 등록과 파일 업로드가 동일한 동별 배분 검증·저장 규칙을 사용합니다. */
@Service
public class IncomeAllocationService {
    private final BuildingRepository buildings;
    private final IncomeAllocationRepository incomeAllocations;
    private final ExternalSettlementLinkRepository settlementLinks;
    private final PaymentTextSecurity security;
    private final Clock clock;
    public IncomeAllocationService(BuildingRepository buildings,IncomeAllocationRepository incomeAllocations,
        ExternalSettlementLinkRepository settlementLinks,@Lazy PaymentTextSecurity security,Clock clock) {
        this.buildings=buildings;this.incomeAllocations=incomeAllocations;this.settlementLinks=settlementLinks;this.security=security;this.clock=clock;
    }
    /** 호출자는 관리대상 잠금과 입금 확정을 완료해야 하며 전액 합계·현재 동·재시도 일치를 다시 검증합니다. */
    @Transactional(propagation=org.springframework.transaction.annotation.Propagation.MANDATORY)
    public void allocate(Payment receipt,BankingRequests.Expense request,UUID user) {
        if(!"CONFIRMED".equals(receipt.getStatus())||!"OTHER".equals(receipt.getReceiptType())||receipt.getDeletedAt()!=null||request.saveAsRule())
            throw new PaymentException("OTHER_INCOME_REQUIRED");
        var property=receipt.getPropertyId();
        if(settlementLinks.findByPropertyId(property).stream().anyMatch(l->receipt.getId().equals(l.getPaymentId()))) throw new PaymentException("INCOME_ALREADY_SETTLED");
        var shares=request.allocations().stream().map(a->{
            if(a.buildingId()==null) throw new PaymentException("INVALID_EXPENSE_TARGET");
            var b=buildings.findById(a.buildingId()).filter(v->property.equals(v.getPropertyId())&&v.getDeletedAt()==null&&v.getStatus()==BuildingStatus.ACTIVE)
                .orElseThrow(()->new PaymentException("INVALID_EXPENSE_TARGET"));
            return new com.moahome.server.expense.domain.Expense.Share(b.getId(),b.getName(),a.amount(),a.percentage());
        }).toList();
        var amounts=com.moahome.server.expense.domain.Expense.allocate(receipt.getAmount(),request.mode(),shares);
        var previous=incomeAllocations.findByPaymentIdOrderBySortOrderAsc(receipt.getId());
        var result=new ArrayList<IncomeAllocation>();
        for(int i=0;i<shares.size();i++) {
            var part=shares.get(i);var percentage="RATIO".equals(request.mode())?new java.math.BigDecimal(part.percentage()).setScale(2):null;
            if(!previous.isEmpty()) {
                if(previous.size()!=shares.size()) throw new PaymentException("BANK_REQUEST_CONFLICT");
                var saved=previous.get(i);
                if(!saved.getBuildingId().equals(part.buildingId())||saved.getAmount().compareTo(amounts.get(i))!=0
                    ||!saved.getAllocationMode().equals(request.mode())||!Objects.equals(saved.getPercentage(),percentage)) throw new PaymentException("BANK_REQUEST_CONFLICT");
                continue;
            }
            result.add(IncomeAllocation.create(property,receipt.getId(),part.buildingId(),security.protect(part.label()).encrypted(),amounts.get(i),percentage,request.mode(),i,user,OffsetDateTime.now(clock)));
        }
        incomeAllocations.saveAllAndFlush(result);
    }
}
