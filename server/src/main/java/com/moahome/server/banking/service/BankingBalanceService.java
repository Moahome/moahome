package com.moahome.server.banking.service;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.stream.Collectors;
import com.moahome.server.auth.exception.*;
import com.moahome.server.banking.domain.*;
import com.moahome.server.banking.dto.*;
import com.moahome.server.banking.repo.*;
import com.moahome.server.billing.domain.BillingCalendar;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.expense.repo.*;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.payment.domain.Payment;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.payment.repo.PaymentRepository;
import com.moahome.server.property.domain.BuildingStatus;
import com.moahome.server.property.repo.*;
import com.moahome.server.property.service.ManagementAccessService;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class BankingBalanceService {
    private final ManagementAccessService access;
    private final PropertyRepository properties;
    private final BuildingRepository buildings;
    private final UnitRepository units;
    private final BankTransactionRepository transactions;
    private final BankAccountRepository accounts;
    private final PaymentRepository payments;
    private final ExpenseRepository expenses;
    private final ExpenseAllocationRepository allocations;
    private final BuildingCashOpeningRepository openings;
    private final BuildingCashOpeningChangeRepository openingChanges;
    private final ExternalSettlementLinkRepository links;
    private final ExternalSettlementDecisionRepository decisions;
    private final PaymentTextSecurity security;
    private final Clock clock;
    private final IncomeAllocationRepository incomeAllocations;
    public BankingBalanceService(ManagementAccessService access,PropertyRepository properties,BuildingRepository buildings,UnitRepository units,
        BankTransactionRepository transactions,BankAccountRepository accounts,PaymentRepository payments,ExpenseRepository expenses,ExpenseAllocationRepository allocations,
        BuildingCashOpeningRepository openings,BuildingCashOpeningChangeRepository openingChanges,ExternalSettlementLinkRepository links,ExternalSettlementDecisionRepository decisions,@Lazy PaymentTextSecurity security,Clock clock,IncomeAllocationRepository incomeAllocations) {
        this.access=access;this.properties=properties;this.buildings=buildings;this.units=units;this.transactions=transactions;this.accounts=accounts;this.payments=payments;
        this.expenses=expenses;this.allocations=allocations;this.openings=openings;this.openingChanges=openingChanges;this.links=links;this.decisions=decisions;this.security=security;this.clock=clock;this.incomeAllocations=incomeAllocations;
    }
    private LocalDate today() { return LocalDate.now(clock.withZone(BillingCalendar.ZONE)); }
    /** 모든 조회·변경은 기존 통장 관리와 동일한 관리대상의 ADMIN 권한을 사용합니다. */
    private void requireAdmin(UUID user,UUID property) {
        if(access.getManagementContext(user,property).role()!=PropertyMemberRole.ADMIN) throw new AuthException(AuthErrorCode.ACCESS_DENIED);
    }
    /** 수납 변경·업로드와 같은 관리대상 잠금으로 시작 잔고·회수액의 동시 초과 처리를 막습니다. */
    private void lock(UUID user,UUID property) {
        requireAdmin(user,property);properties.findForUnitUpdate(property).orElseThrow(()->new AuthException(AuthErrorCode.ACCESS_DENIED));requireAdmin(user,property);
    }
    private boolean active(Payment p) { return p.getDeletedAt()==null&&"CONFIRMED".equals(p.getStatus()); }
    private String amount(BigDecimal value) { return value.toPlainString(); }

    /** 한 시점의 확정 현금·외부 회수 이력을 읽고 기준일 이전은 확인된 동별 현금을 역산하고 귀속 미확인 금액은 임의 배분하지 않습니다. */
    public BankingBalanceResponse.Workspace workspace(UUID user,UUID property,String rawMonth) {
        requireAdmin(user,property);YearMonth month=BillingCalendar.parseMonth(rawMonth);LocalDate end=month.atEndOfMonth();
        var savedOpenings=openings.findByPropertyId(property);
        LocalDate cutoff=savedOpenings.stream().map(BuildingCashOpening::getCutoffDate).findFirst().orElse(null);
        var openingByBuilding=savedOpenings.stream().collect(Collectors.toMap(BuildingCashOpening::getBuildingId,o->o));
        var common=accounts.findByPropertyIdAndDeletedAtIsNull(property).stream().filter(a->a.isPrimary()&&a.getBuildingId()==null&&a.getStatus()==BankAccountStatus.ACTIVE).toList();
        if(common.size()!=1) throw new PaymentException("PAYMENT_ACCOUNT_UNAVAILABLE");
        // 과거 월을 역산할 때 기준일까지의 거래가 필요합니다. 은행 잔고·외부 회수는 별도로 조회 월 말에 제한합니다.
        LocalDate readEnd=cutoff!=null&&cutoff.isAfter(end)?cutoff:end;
        LocalDate reviewStart=cutoff==null||month.atDay(1).isBefore(cutoff)?month.atDay(1).minusDays(1):cutoff;
        var bank=transactions.findByPropertyId(property).stream().filter(t->t.getBankAccountId().equals(common.getFirst().getId())&&t.getDeletedAt()==null&&!t.getTransactionDate().isAfter(readEnd)).toList();
        var bankById=bank.stream().collect(Collectors.toMap(BankTransaction::getId,t->t));
        var receipts=payments.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(property).stream().filter(this::active)
            .filter(p->p.getBankTransactionId()!=null&&bankById.containsKey(p.getBankTransactionId())&&"INCOME".equals(bankById.get(p.getBankTransactionId()).getDirection())).toList();
        var receiptById=receipts.stream().filter(p->!bankById.get(p.getBankTransactionId()).getTransactionDate().isAfter(end)).collect(Collectors.toMap(Payment::getId,p->p));
        var expenseById=expenses.findByPropertyIdOrderByConfirmedAtDesc(property).stream().filter(e->bankById.containsKey(e.getBankTransactionId())).collect(Collectors.toMap(e->e.getId(),e->e));
        var parts=allocations.findByPropertyIdOrderBySortOrderAsc(property).stream().filter(a->expenseById.containsKey(a.getExpenseId())).toList();
        // 삭제한 출금의 회수 연결은 이력만 유지하고 기타 입금의 사용 가능액을 다시 엽니다.
        var liveParts=parts.stream().map(a->a.getId()).collect(Collectors.toSet());
        var savedLinks=links.findByPropertyId(property).stream().filter(l->receiptById.containsKey(l.getPaymentId())&&liveParts.contains(l.getAllocationId())).toList();
        var spent=savedLinks.stream().collect(Collectors.groupingBy(ExternalSettlementLink::getPaymentId,Collectors.reducing(BigDecimal.ZERO,ExternalSettlementLink::getAmount,BigDecimal::add)));
        var distributed=incomeAllocations.findByPropertyIdOrderBySortOrderAsc(property).stream()
            .collect(Collectors.groupingBy(IncomeAllocation::getPaymentId));
        var entries=new ArrayList<BankingBalanceResponse.Entry>();
        for(var p:receipts) {
            if("OTHER".equals(p.getReceiptType())&&distributed.containsKey(p.getId())) {
                var original=bankById.get(p.getBankTransactionId());
                for(var part:distributed.get(p.getId())) entries.add(new BankingBalanceResponse.Entry(original.getId(),part.getBuildingId(),original.getTransactionDate(),original.getTransactionTime(),security.decrypt(p.getIncomeCategoryEncrypted()),amount(part.getAmount()),"0",p.getId()));
                continue;
            }
            if(!"HOUSEHOLD".equals(p.getReceiptType())||p.getCashBuildingId()==null) continue;
            var original=bankById.get(p.getBankTransactionId());
            entries.add(new BankingBalanceResponse.Entry(original.getId(),p.getCashBuildingId(),original.getTransactionDate(),original.getTransactionTime(),security.decrypt(p.getPayerNameEncrypted()),amount(p.getAmount()),"0",p.getId()));
        }
        for(var part:parts) {
            if(part.getBuildingId()==null) continue;
            var e=expenseById.get(part.getExpenseId());var original=bankById.get(e.getBankTransactionId());
            entries.add(new BankingBalanceResponse.Entry(original.getId(),part.getBuildingId(),original.getTransactionDate(),original.getTransactionTime(),security.decrypt(e.getCategoryEncrypted()),"0",amount(part.getAllocatedAmount()),null));
        }
        var result=new ArrayList<BankingBalanceResponse.Building>();
        for(var b:buildings.findByPropertyId(property)) {
            boolean current=b.getDeletedAt()==null&&b.getStatus()==BuildingStatus.ACTIVE;
            if(!current&&!openingByBuilding.containsKey(b.getId())&&entries.stream().noneMatch(e->b.getId().equals(e.buildingId()))) continue;
            var opening=openingByBuilding.get(b.getId());
            String state=opening==null?"OPENING_REQUIRED":"READY";
            var movements=entries.stream().filter(e->b.getId().equals(e.buildingId())).map(e->new BuildingCashCalculation.Movement(e.date(),new BigDecimal(e.income()),new BigDecimal(e.expense()))).toList();
            var totals=BuildingCashCalculation.calculate(opening==null?BigDecimal.ZERO:opening.getAmount(),cutoff==null?end:cutoff,month,movements);
            result.add(new BankingBalanceResponse.Building(b.getId(),b.getName(),current,"READY".equals(state)?amount(totals.start()):null,amount(totals.income()),amount(totals.expense()),"READY".equals(state)?amount(totals.balance()):null,state,opening==null?null:amount(opening.getAmount()),opening==null?0:opening.getRevision()));
        }
        var decisionByAllocation=decisions.findByPropertyIdOrderByRevisionAsc(property).stream()
            .collect(Collectors.toMap(ExternalSettlementDecision::getAllocationId,d->d,(previous,next)->next));
        var external=new ArrayList<BankingBalanceResponse.External>();
        for(var part:parts) {
            if(part.getBuildingId()!=null) continue;
            var expense=expenseById.get(part.getExpenseId());var original=bankById.get(expense.getBankTransactionId());
            if(cutoff==null||!original.getTransactionDate().isAfter(cutoff)||original.getTransactionDate().isAfter(end)) continue;
            var recoveries=savedLinks.stream().filter(l->l.getAllocationId().equals(part.getId())).map(l->{
                var p=receiptById.get(l.getPaymentId());return new BankingBalanceResponse.Recovery(l.getId(),p.getId(),p.getPaymentDate(),security.decrypt(p.getPayerNameEncrypted()),amount(l.getAmount()));
            }).toList();
            var recovered=recoveries.stream().map(r->new BigDecimal(r.amount())).reduce(BigDecimal.ZERO,BigDecimal::add);
            var decision=decisionByAllocation.get(part.getId());
            external.add(new BankingBalanceResponse.External(part.getId(),security.decrypt(part.getTargetLabelEncrypted()),security.decrypt(expense.getCategoryEncrypted()),original.getTransactionDate(),amount(part.getAllocatedAmount()),amount(recovered),amount(part.getAllocatedAmount().subtract(recovered)),recoveries,decision!=null&&decision.isExcluded(),decision==null?0:decision.getRevision()));
        }
        var unitById=units.findByPropertyId(property).stream().collect(Collectors.toMap(u->u.getId(),u->u));
        var buildingById=buildings.findByPropertyId(property).stream().collect(Collectors.toMap(b->b.getId(),b->b));
        var income=new ArrayList<BankingBalanceResponse.Income>();
        for(var p:receipts) {
            if(!p.getPaymentDate().isAfter(reviewStart)) continue;
            if(("HOUSEHOLD".equals(p.getReceiptType())&&p.getCashBuildingId()!=null)||distributed.containsKey(p.getId())) continue;
            // 현재 연결 세대는 확인용 단서입니다. 이 위치로 과거 귀속을 자동 확정하지 않습니다.
            var matched=unitById.get(p.getMatchedUnitId());
            var linkedBuilding=matched==null?null:buildingById.get(matched.getBuildingId());
            String linkedUnitLabel=matched==null?null:(linkedBuilding==null?"":linkedBuilding.getName()+" ")+matched.getUnitNumber()+"호";
            income.add(new BankingBalanceResponse.Income(p.getId(),p.getBankTransactionId(),p.getPaymentDate(),security.decrypt(p.getPayerNameEncrypted()),amount(p.getAmount()),amount(p.getAmount().subtract(spent.getOrDefault(p.getId(),BigDecimal.ZERO))),p.getReceiptType(),linkedBuilding==null?null:linkedBuilding.getId(),linkedUnitLabel));
        }
        var confirmedTransactions=receipts.stream().map(Payment::getBankTransactionId).collect(Collectors.toSet());
        confirmedTransactions.addAll(expenseById.values().stream().map(e->e.getBankTransactionId()).toList());
        var pending=bank.stream().filter(t->t.getTransactionDate().isAfter(reviewStart)&&!confirmedTransactions.contains(t.getId()))
            .map(t->new BankingBalanceResponse.Pending(t.getId(),t.getTransactionDate(),security.decrypt(t.getPayerNameEncrypted()),t.getDirection(),amount(t.getAmount()))).toList();
        var bankAsOfMonth=bank.stream().filter(t->!t.getTransactionDate().isAfter(end)).toList();
        var lastSource=bankAsOfMonth.stream().max(Comparator.comparing(BankTransaction::getTransactionDate).thenComparing(t->t.getTransactionTime()==null?LocalTime.MIN:t.getTransactionTime()));
        var latest=lastSource.filter(t->t.getBalance()!=null);
        // 같은 날 시각 없는 여러 거래가 있으면 실제 마지막 잔고를 임의로 고르지 않습니다.
        var lastDay=lastSource.map(t->bankAsOfMonth.stream().filter(b->b.getTransactionDate().equals(t.getTransactionDate())).toList()).orElse(List.of());
        boolean ambiguous=lastDay.size()>1&&(lastDay.stream().anyMatch(t->t.getTransactionTime()==null)
            ||lastSource.map(t->lastDay.stream().filter(b->Objects.equals(t.getTransactionTime(),b.getTransactionTime())).map(BankTransaction::getBalance).distinct().count()>1).orElse(false));
        return new BankingBalanceResponse.Workspace(property,rawMonth,cutoff,ambiguous?null:latest.map(t->amount(t.getBalance())).orElse(null),lastSource.map(t->t.getTransactionDate()+(ambiguous?" 거래 순서 확인 필요":t.getBalance()==null?" 잔고 미제공":t.getTransactionTime()==null?"":" "+t.getTransactionTime())).orElse(null),result,
            entries.stream().filter(e->YearMonth.from(e.date()).equals(month)).toList(),external,income,pending);
    }

    /** 기준일 마감 잔고는 한 번만 등록합니다. 같은 내용 재시도와 이후 추가된 동의 최초 등록만 허용합니다. */
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void saveOpenings(UUID user,UUID property,BankingBalanceRequests.Opening request) {
        lock(user,property);
        var cutoff=request.cutoffDate();
        if(cutoff.isAfter(today())) throw new PaymentException("INVALID_CASH_OPENING_DATE");
        var saved=openings.findByPropertyId(property);if(saved.stream().anyMatch(o->!o.getCutoffDate().equals(cutoff))) throw new PaymentException("CASH_OPENING_CONFLICT");
        var byId=saved.stream().collect(Collectors.toMap(BuildingCashOpening::getBuildingId,o->o));
        var current=buildings.findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(property).stream().filter(b->b.getStatus()==BuildingStatus.ACTIVE).map(b->b.getId()).collect(Collectors.toSet());
        var seen=new HashSet<UUID>();var added=new ArrayList<BuildingCashOpening>();
        for(var part:request.buildings()) {
            if(!current.contains(part.buildingId())||!seen.add(part.buildingId())) throw new PaymentException("INVALID_CASH_OPENING");
            var previous=byId.get(part.buildingId());
            if(previous!=null) {
                if(previous.getAmount().compareTo(new BigDecimal(part.amount()))!=0) throw new PaymentException("CASH_OPENING_CONFLICT");
                continue;
            }
            added.add(BuildingCashOpening.create(property,part.buildingId(),cutoff,part.amount(),user,OffsetDateTime.now(clock)));
        }
        if(!current.stream().allMatch(id->byId.containsKey(id)||seen.contains(id))) throw new PaymentException("INVALID_CASH_OPENING");
        openings.saveAllAndFlush(added);
    }
    /** 기준일과 등록된 모든 동의 마감 잔고를 함께 정정합니다. 기대 버전으로 오래된 화면의 덮어쓰기를 막습니다. */
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void correctOpenings(UUID user,UUID property,BankingBalanceRequests.OpeningCorrection request) {
        lock(user,property);
        var repeated=openingChanges.findByRequestId(request.id());
        if(!repeated.isEmpty()) {
            var repeatedByBuilding=repeated.stream().collect(Collectors.toMap(BuildingCashOpeningChange::getBuildingId,c->c));
            var ids=request.buildings().stream().map(BankingBalanceRequests.OpeningCorrectionPart::buildingId).collect(Collectors.toSet());
            if(repeated.size()!=request.buildings().size()||ids.size()!=request.buildings().size()) throw new PaymentException("CASH_OPENING_CONFLICT");
            for(var part:request.buildings()) {
                var change=repeatedByBuilding.get(part.buildingId());
                if(change==null||!property.equals(change.getPropertyId())||!request.cutoffDate().equals(change.getNewCutoffDate())
                    ||change.getNewAmount().compareTo(new BigDecimal(part.amount()))!=0||change.getPreviousRevision()!=part.revision())
                    throw new PaymentException("CASH_OPENING_CONFLICT");
            }
            return;
        }
        if(request.cutoffDate().isAfter(today())) throw new PaymentException("INVALID_CASH_OPENING_DATE");
        var saved=openings.findByPropertyId(property);
        var byId=saved.stream().collect(Collectors.toMap(BuildingCashOpening::getBuildingId,o->o));
        if(saved.isEmpty()||request.buildings().size()!=saved.size()) throw new PaymentException("INVALID_CASH_OPENING");
        var seen=new HashSet<UUID>();
        for(var part:request.buildings()) {
            var current=byId.get(part.buildingId());
            if(current==null||!seen.add(part.buildingId())) throw new PaymentException("INVALID_CASH_OPENING");
            if(current.getRevision()!=part.revision()) throw new PaymentException("CASH_OPENING_CONFLICT");
        }
        // 검증을 모두 마친 뒤 변경해 일부 동만 새 기준일로 남지 않게 합니다. DB가 이전 값과 수정자를 보관합니다.
        var at=OffsetDateTime.now(clock);
        for(var part:request.buildings()) byId.get(part.buildingId()).correct(request.cutoffDate(),part.amount(),request.id(),user,at);
        openings.flush();
    }
    /** 기존 확정 수납의 과거 동은 관리자가 확인해 지정하며 현재 세대 위치로 자동 추정하지 않습니다. */
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void assignIncome(UUID user,UUID property,BankingBalanceRequests.IncomeAssignment request) {
        lock(user,property);var p=payments.findById(request.paymentId()).filter(v->property.equals(v.getPropertyId())&&active(v)&&v.getBankTransactionId()!=null).orElseThrow(()->new PaymentException("PAYMENT_NOT_FOUND"));
        buildings.findByIdAndPropertyIdAndDeletedAtIsNull(request.buildingId(),property).filter(b->b.getStatus()==BuildingStatus.ACTIVE).orElseThrow(()->new PaymentException("INVALID_EXPENSE_TARGET"));
        p.assignCashBuilding(request.buildingId());payments.flush();
    }
    /** 실제 기타 입금의 미사용액과 외부 부담액 잔여를 함께 검증해 부분 회수·여러 건 회수를 지원합니다. */
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void settle(UUID user,UUID property,BankingBalanceRequests.Settlement request) {
        lock(user,property);
        var previous=links.findById(request.id());
        if(previous.isPresent()) {
            var p=previous.get();
            if(!property.equals(p.getPropertyId())||!p.getAllocationId().equals(request.allocationId())||!p.getPaymentId().equals(request.paymentId())||p.getAmount().compareTo(new BigDecimal(request.amount()))!=0) throw new PaymentException("EXTERNAL_SETTLEMENT_CONFLICT");
            return;
        }
        var data=workspace(user,property,YearMonth.from(today()).toString());
        var external=data.externals().stream().filter(e->e.id().equals(request.allocationId())).findFirst().orElseThrow(()->new PaymentException("INVALID_EXTERNAL_SETTLEMENT"));
        if(external.excluded()) throw new PaymentException("EXTERNAL_SETTLEMENT_EXCLUDED");
        var income=data.incomes().stream().filter(i->i.id().equals(request.paymentId())&&"OTHER".equals(i.kind())).findFirst().orElseThrow(()->new PaymentException("INVALID_EXTERNAL_SETTLEMENT"));
        var value=new BigDecimal(request.amount());
        if(value.signum()<=0||value.compareTo(new BigDecimal(external.remaining()))>0||value.compareTo(new BigDecimal(income.available()))>0) throw new PaymentException("EXTERNAL_SETTLEMENT_EXCEEDED");
        links.saveAndFlush(ExternalSettlementLink.create(request.id(),property,request.allocationId(),request.paymentId(),request.amount(),user,OffsetDateTime.now(clock)));
    }
    /** 정산 대상을 제외·복원하되 실제 입출금·배분액·회수액은 변경하지 않습니다. 재시도는 같은 요청 ID로 처리합니다. */
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void decideSettlement(UUID user,UUID property,BankingBalanceRequests.SettlementDecision request) {
        lock(user,property);
        var repeated=decisions.findById(request.id());
        if(repeated.isPresent()) {
            var saved=repeated.get();
            if(!property.equals(saved.getPropertyId())||!request.allocationId().equals(saved.getAllocationId())
                ||saved.isExcluded()!=request.excluded()||saved.getRevision()!=request.revision()+1)
                throw new PaymentException("EXTERNAL_SETTLEMENT_DECISION_CONFLICT");
            return;
        }
        allocations.findById(request.allocationId()).filter(a->property.equals(a.getPropertyId())&&a.getBuildingId()==null)
            .orElseThrow(()->new PaymentException("INVALID_EXTERNAL_SETTLEMENT"));
        var latest=decisions.findFirstByPropertyIdAndAllocationIdOrderByRevisionDesc(property,request.allocationId());
        long revision=latest.map(ExternalSettlementDecision::getRevision).orElse(0L);
        if(revision!=request.revision()) throw new PaymentException("EXTERNAL_SETTLEMENT_DECISION_CONFLICT");
        decisions.saveAndFlush(ExternalSettlementDecision.create(request.id(),property,request.allocationId(),request.excluded(),revision+1,user,OffsetDateTime.now(clock)));
    }

}
