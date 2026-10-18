package com.moahome.server.expense.service;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import com.moahome.server.banking.domain.BankTransaction;
import com.moahome.server.banking.dto.*;
import com.moahome.server.banking.service.BankTransactionKeys;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.common.validation.TextValues;
import com.moahome.server.expense.domain.*;
import com.moahome.server.expense.repo.*;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.property.domain.BuildingStatus;
import com.moahome.server.property.repo.BuildingRepository;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExpenseService {
    private final ExpenseRepository expenses;
    private final ExpenseAllocationRepository allocations;
    private final BuildingRepository buildings;
    private final PaymentTextSecurity security;
    private final Clock clock;
    public ExpenseService(ExpenseRepository expenses,ExpenseAllocationRepository allocations,BuildingRepository buildings,@Lazy PaymentTextSecurity security,Clock clock) {
        this.expenses=expenses;this.allocations=allocations;this.buildings=buildings;this.security=security;this.clock=clock;
    }
    /** 호출자는 관리대상 잠금·권한을 먼저 확보합니다. 비용과 동별 배분을 함께 저장해 부분 확정을 막습니다. */
    @Transactional
    public void confirm(BankTransaction original,BankingRequests.Expense request,UUID actor) {
        if(original.isTransferCandidate()) throw new PaymentException("BANK_TRANSFER_CONFLICT");
        if(!"EXPENSE".equals(original.getDirection())||original.getDeletedAt()!=null) throw new PaymentException("INVALID_BANK_SELECTION");
        var shares=request.allocations().stream().map(a->{
            String label=a.buildingId()==null?TextValues.required(a.label(),100):buildings.findById(a.buildingId())
                .filter(v->original.getPropertyId().equals(v.getPropertyId())&&v.getDeletedAt()==null&&v.getStatus()==BuildingStatus.ACTIVE)
                .orElseThrow(()->new PaymentException("INVALID_EXPENSE_TARGET")).getName();
            return new Expense.Share(a.buildingId(),label,a.amount(),a.percentage());
        }).toList();
        var amounts=Expense.allocate(original.getAmount(),request.mode(),shares);
        String category=TextValues.required(request.category(),100),note=TextValues.optional(request.note(),500);
        var previous=expenses.findByBankTransactionId(original.getId());
        if(previous.isPresent()) {
            var e=previous.get();var saved=allocations.findByPropertyIdOrderBySortOrderAsc(original.getPropertyId()).stream().filter(a->e.getId().equals(a.getExpenseId())).toList();
            boolean same=category.equals(security.decrypt(e.getCategoryEncrypted()))&&Objects.equals(note,security.decrypt(e.getMemoEncrypted()))
                &&request.mode().equals(e.getAllocationMode())&&request.saveAsRule()==e.isSaveAsRule()&&saved.size()==shares.size();
            for(int i=0;same&&i<shares.size();i++) same=Objects.equals(saved.get(i).getBuildingId(),shares.get(i).buildingId())
                &&security.decrypt(saved.get(i).getTargetLabelEncrypted()).equals(shares.get(i).label())&&saved.get(i).getAllocatedAmount().compareTo(amounts.get(i))==0
                &&Objects.equals(saved.get(i).getPercentage(),percentage(shares.get(i),request.mode()));
            if(!same) throw new PaymentException("BANK_REQUEST_CONFLICT");
            return;
        }
        var expense=expenses.saveAndFlush(Expense.create(original.getPropertyId(),original.getId(),security.protect(category).encrypted(),
            note==null?null:security.protect(note).encrypted(),original.getAmount(),request.mode(),request.saveAsRule(),
            BankTransactionKeys.ruleKey(security.decrypt(original.getPayerNameEncrypted()),security),actor,OffsetDateTime.now(clock)));
        var parts=new ArrayList<ExpenseAllocation>();
        for(int i=0;i<shares.size();i++) {
            var share=shares.get(i);
            parts.add(ExpenseAllocation.create(original.getPropertyId(),expense.getId(),share.buildingId(),security.protect(share.label()).encrypted(),amounts.get(i),percentage(share,request.mode()),i));
        }
        allocations.saveAllAndFlush(parts);
    }
    private BigDecimal percentage(Expense.Share share,String mode) { return "RATIO".equals(mode)?new BigDecimal(share.percentage()).setScale(2):null; }
}
