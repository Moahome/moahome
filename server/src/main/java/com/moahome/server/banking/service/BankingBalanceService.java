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
    private final BankTransferRepository transfers;
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
    private final com.moahome.server.billing.repo.OpeningBalanceBatchRepository openingBatches;
    private final com.moahome.server.billing.repo.BankOpeningBalanceRepository bankOpenings;
    public BankingBalanceService(ManagementAccessService access,PropertyRepository properties,BuildingRepository buildings,UnitRepository units,
        BankTransactionRepository transactions,BankAccountRepository accounts,PaymentRepository payments,ExpenseRepository expenses,ExpenseAllocationRepository allocations,
        BuildingCashOpeningRepository openings,BuildingCashOpeningChangeRepository openingChanges,ExternalSettlementLinkRepository links,ExternalSettlementDecisionRepository decisions,@Lazy PaymentTextSecurity security,Clock clock,IncomeAllocationRepository incomeAllocations,
        com.moahome.server.billing.repo.OpeningBalanceBatchRepository openingBatches,com.moahome.server.billing.repo.BankOpeningBalanceRepository bankOpenings,BankTransferRepository transfers) {
        this.access=access;this.properties=properties;this.buildings=buildings;this.units=units;this.transactions=transactions;this.accounts=accounts;this.payments=payments;
        this.expenses=expenses;this.allocations=allocations;this.openings=openings;this.openingChanges=openingChanges;this.links=links;this.decisions=decisions;this.security=security;this.clock=clock;this.incomeAllocations=incomeAllocations;
        this.openingBatches=openingBatches;this.bankOpenings=bankOpenings;this.transfers=transfers;
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
        return workspace(user,property,rawMonth,null);
    }
    /** 선택 통장은 동별 기준값·입출금·정산까지 같은 범위로 조회하고 전체는 통장별 계산 결과를 합산합니다. */
    public BankingBalanceResponse.Workspace workspace(UUID user,UUID property,String rawMonth,UUID accountId) {
        requireAdmin(user,property);YearMonth month=BillingCalendar.parseMonth(rawMonth);LocalDate end=month.atEndOfMonth();
        var common=accounts.findByPropertyIdAndDeletedAtIsNull(property).stream().filter(a->a.getBuildingId()==null).toList();
        if(common.stream().filter(a->a.isPrimary()&&a.getStatus()==BankAccountStatus.ACTIVE).count()!=1
            ||(accountId!=null&&common.stream().noneMatch(a->a.getId().equals(accountId)))) throw new PaymentException("PAYMENT_ACCOUNT_UNAVAILABLE");
        var allOpenings=openings.findByPropertyId(property);
        var allBank=transactions.findByPropertyId(property).stream().filter(t->t.getDeletedAt()==null).toList();
        var allReceipts=payments.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(property).stream().filter(this::active).toList();
        var confirmedBatches=openingBatches.findByPropertyIdOrderByCreatedAtDesc(property).stream().filter(batch->"CONFIRMED".equals(batch.getStatus())).toList();
        var independentOpenings=bankOpenings.findByPropertyIdAndBatchIdIsNullOrderByRevisionDesc(property);
        var actualOpenings=new ArrayList<>(independentOpenings);
        confirmedBatches.forEach(batch->actualOpenings.addAll(bankOpenings.findByBatchId(batch.getId())));
        // 앱 등록 전 거래·기준값은 실제 과거 사용 근거입니다. 그 근거보다도 이른 월에 새 통장의 잔고를 만들어 넣지 않습니다.
        var availableAccounts=common.stream().filter(a->!accountAvailableFrom(a,allOpenings,allBank,allReceipts,actualOpenings,common.size()==1).isAfter(end)).toList();
        UUID selectedAccountId=accountId!=null&&availableAccounts.stream().anyMatch(a->a.getId().equals(accountId))?accountId:null;
        var scopedAccounts=availableAccounts.stream().filter(a->selectedAccountId==null||selectedAccountId.equals(a.getId())).toList();
        var accountIds=scopedAccounts.stream().map(BankAccount::getId).collect(Collectors.toSet());
        boolean legacy=!scopedAccounts.isEmpty()&&selectedAccountId==null&&allOpenings.stream().noneMatch(o->o.getBankAccountId()!=null);
        var savedOpenings=allOpenings.stream().filter(o->legacy?o.getBankAccountId()==null:o.getBankAccountId()!=null&&accountIds.contains(o.getBankAccountId())).toList();
        var dates=savedOpenings.stream().map(BuildingCashOpening::getCutoffDate).distinct().toList();
        LocalDate cutoff=dates.size()==1?dates.getFirst():null;
        LocalDate latestCutoff=dates.stream().max(LocalDate::compareTo).orElse(end);
        LocalDate firstCutoff=dates.stream().min(LocalDate::compareTo).orElse(null);
        var openingByBuilding=savedOpenings.stream().collect(Collectors.groupingBy(BuildingCashOpening::getBuildingId));
        // 각 통장의 기준일이 달라도 모든 계산에 필요한 원본을 읽고 통장별 기준일로 각각 누적·역산합니다.
        LocalDate readEnd=latestCutoff.isAfter(end)?latestCutoff:end;
        LocalDate reviewStart=firstCutoff==null||month.atDay(1).isBefore(firstCutoff)?month.atDay(1).minusDays(1):firstCutoff;
        var bank=allBank.stream().filter(t->accountIds.contains(t.getBankAccountId())&&!t.getTransactionDate().isAfter(readEnd)).toList();
        var bankById=bank.stream().collect(Collectors.toMap(BankTransaction::getId,t->t));
        // 수동 기타 입금은 관리자가 확인한 금액으로 반영하고 은행 확인 잔액은 파일 원본에서만 조회합니다.
        var receipts=allReceipts.stream()
            .filter(p->accountIds.contains(p.getBankAccountId())&&!p.getPaymentDate().isAfter(readEnd))
            .filter(p->p.getBankTransactionId()==null
                ? "MANUAL".equals(p.getSourceType())&&"OTHER".equals(p.getReceiptType())
                : bankById.containsKey(p.getBankTransactionId())&&"INCOME".equals(bankById.get(p.getBankTransactionId()).getDirection())).toList();
        var receiptById=receipts.stream().filter(p->!p.getPaymentDate().isAfter(end)).collect(Collectors.toMap(Payment::getId,p->p));
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
                for(var part:distributed.get(p.getId())) entries.add(new BankingBalanceResponse.Entry(original==null?p.getId():original.getId(),part.getBuildingId(),p.getPaymentDate(),original==null?null:original.getTransactionTime(),security.decrypt(p.getIncomeCategoryEncrypted()),amount(part.getAmount()),"0",p.getId(),p.getBankAccountId()));
                continue;
            }
            if(!"HOUSEHOLD".equals(p.getReceiptType())||p.getCashBuildingId()==null) continue;
            var original=bankById.get(p.getBankTransactionId());
            entries.add(new BankingBalanceResponse.Entry(original.getId(),p.getCashBuildingId(),original.getTransactionDate(),original.getTransactionTime(),security.decrypt(p.getPayerNameEncrypted()),amount(p.getAmount()),"0",p.getId(),p.getBankAccountId()));
        }
        for(var part:parts) {
            if(part.getBuildingId()==null) continue;
            var e=expenseById.get(part.getExpenseId());var original=bankById.get(e.getBankTransactionId());
            entries.add(new BankingBalanceResponse.Entry(original.getId(),part.getBuildingId(),original.getTransactionDate(),original.getTransactionTime(),security.decrypt(e.getCategoryEncrypted()),"0",amount(part.getAllocatedAmount()),null,original.getBankAccountId()));
        }
        var result=new ArrayList<BankingBalanceResponse.Building>();
        for(var b:buildings.findByPropertyId(property)) {
            if(scopedAccounts.isEmpty()) continue;
            boolean current=b.getDeletedAt()==null&&b.getStatus()==BuildingStatus.ACTIVE;
            if(!current&&!openingByBuilding.containsKey(b.getId())&&entries.stream().noneMatch(e->b.getId().equals(e.buildingId()))) continue;
            var buildingOpenings=openingByBuilding.getOrDefault(b.getId(),List.of());
            var buildingEntries=entries.stream().filter(e->b.getId().equals(e.buildingId())).toList();
            BigDecimal startBalance=BigDecimal.ZERO,incomeTotal=BigDecimal.ZERO,expenseTotal=BigDecimal.ZERO,endBalance=BigDecimal.ZERO;
            boolean complete=true;
            if(legacy) {
                var opening=buildingOpenings.isEmpty()?null:buildingOpenings.getFirst();
                var movements=buildingEntries.stream().map(e->new BuildingCashCalculation.Movement(e.date(),new BigDecimal(e.income()),new BigDecimal(e.expense()))).toList();
                var totals=BuildingCashCalculation.calculate(opening==null?BigDecimal.ZERO:opening.getAmount(),cutoff==null?end:cutoff,month,movements);
                complete=opening!=null;startBalance=totals.start();incomeTotal=totals.income();expenseTotal=totals.expense();endBalance=totals.balance();
            } else {
                for(var account:scopedAccounts) {
                    var opening=buildingOpenings.stream().filter(o->account.getId().equals(o.getBankAccountId())).findFirst().orElse(null);
                    var accountEntries=buildingEntries.stream().filter(e->account.getId().equals(e.accountId())).toList();
                    if(opening==null&&accountEntries.isEmpty()&&account.getStatus()==BankAccountStatus.CLOSED) continue;
                    if(!current&&opening==null&&accountEntries.isEmpty()) continue;
                    var movements=accountEntries.stream().map(e->new BuildingCashCalculation.Movement(e.date(),new BigDecimal(e.income()),new BigDecimal(e.expense()))).toList();
                    var totals=BuildingCashCalculation.calculate(opening==null?BigDecimal.ZERO:opening.getAmount(),opening==null?end:opening.getCutoffDate(),month,movements);
                    complete&=opening!=null;startBalance=startBalance.add(totals.start());incomeTotal=incomeTotal.add(totals.income());expenseTotal=expenseTotal.add(totals.expense());endBalance=endBalance.add(totals.balance());
                }
            }
            var direct=buildingOpenings.size()==1?buildingOpenings.getFirst():null;
            result.add(new BankingBalanceResponse.Building(b.getId(),b.getName(),current,complete?amount(startBalance):null,amount(incomeTotal),amount(expenseTotal),complete?amount(endBalance):null,complete?"READY":"OPENING_REQUIRED",direct==null?null:amount(direct.getAmount()),direct==null?0:direct.getRevision()));
        }
        var decisionByAllocation=decisions.findByPropertyIdOrderByRevisionAsc(property).stream()
            .collect(Collectors.toMap(ExternalSettlementDecision::getAllocationId,d->d,(previous,next)->next));
        var external=new ArrayList<BankingBalanceResponse.External>();
        for(var part:parts) {
            if(part.getBuildingId()!=null) continue;
            var expense=expenseById.get(part.getExpenseId());var original=bankById.get(expense.getBankTransactionId());
            var expenseCutoff=legacy?cutoff:savedOpenings.stream().filter(o->original.getBankAccountId().equals(o.getBankAccountId())).map(BuildingCashOpening::getCutoffDate).findFirst().orElse(null);
            if(expenseCutoff==null||!original.getTransactionDate().isAfter(expenseCutoff)||original.getTransactionDate().isAfter(end)) continue;
            var recoveries=savedLinks.stream().filter(l->l.getAllocationId().equals(part.getId())).map(l->{
                var p=receiptById.get(l.getPaymentId());return new BankingBalanceResponse.Recovery(l.getId(),p.getId(),p.getPaymentDate(),security.decrypt(p.getPayerNameEncrypted()),amount(l.getAmount()));
            }).toList();
            var recovered=recoveries.stream().map(r->new BigDecimal(r.amount())).reduce(BigDecimal.ZERO,BigDecimal::add);
            var decision=decisionByAllocation.get(part.getId());
            // 잘못 가져온 출금은 기존 거래 삭제로 제거합니다. 부담액과 원본 전액을 함께 반환해 삭제 범위를 확인하게 합니다.
            external.add(new BankingBalanceResponse.External(part.getId(),security.decrypt(part.getTargetLabelEncrypted()),security.decrypt(expense.getCategoryEncrypted()),original.getTransactionDate(),amount(part.getAllocatedAmount()),amount(recovered),amount(part.getAllocatedAmount().subtract(recovered)),recoveries,decision!=null&&decision.isExcluded(),decision==null?0:decision.getRevision(),original.getBankAccountId(),original.getId(),amount(original.getAmount())));
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
            income.add(new BankingBalanceResponse.Income(p.getId(),p.getBankTransactionId(),p.getPaymentDate(),security.decrypt(p.getPayerNameEncrypted()),amount(p.getAmount()),amount(p.getAmount().subtract(spent.getOrDefault(p.getId(),BigDecimal.ZERO))),p.getReceiptType(),linkedBuilding==null?null:linkedBuilding.getId(),linkedUnitLabel,p.getBankAccountId()));
        }
        var confirmedTransactions=receipts.stream().map(Payment::getBankTransactionId).collect(Collectors.toSet());
        confirmedTransactions.addAll(expenseById.values().stream().map(e->e.getBankTransactionId()).toList());
        transfers.findByPropertyId(property).stream().filter(t->t.getCanceledAt()==null).forEach(t->{
            confirmedTransactions.add(t.getOutgoingId());confirmedTransactions.add(t.getIncomingId());
        });
        var pending=bank.stream().filter(t->t.getTransactionDate().isAfter(reviewStart)&&!confirmedTransactions.contains(t.getId()))
            .map(t->new BankingBalanceResponse.Pending(t.getId(),t.getTransactionDate(),(t.isTransferCandidate()?"이체 연결 대기 · ":"")+security.decrypt(t.getPayerNameEncrypted()),t.getDirection(),amount(t.getAmount()))).toList();
        // 계좌별 마지막 원본과 인계값을 각각 확인합니다. 한 통장이라도 미확인이면 전체를 0원으로 대체하지 않습니다.
        var openingBatch=confirmedBatches.stream().filter(batch->!batch.getCutoffDate().isAfter(end)).findFirst();
        var baselines=openingBatch.map(batch -> bankOpenings.findByBatchId(batch.getId())).orElse(List.of());
        var independent=independentOpenings.stream()
            .collect(Collectors.toMap(o->o.getBankAccountId(),o->o,(latest,older)->latest));
        var accountBalances=new ArrayList<BankingBalanceResponse.AccountBalance>();
        var requiredBuildings=buildings.findByPropertyId(property).stream().filter(b->b.getDeletedAt()==null&&b.getStatus()==BuildingStatus.ACTIVE).map(b->b.getId()).collect(Collectors.toSet());
        for(var account:availableAccounts) {
            var accountRows=allBank.stream().filter(t -> t.getBankAccountId().equals(account.getId())&&!t.getTransactionDate().isAfter(end)).toList();
            var last=accountRows.stream().max(Comparator.comparing(BankTransaction::getTransactionDate).thenComparing(t->t.getTransactionTime()==null?LocalTime.MIN:t.getTransactionTime()));
            var lastDay=last.map(t->accountRows.stream().filter(b->b.getTransactionDate().equals(t.getTransactionDate())).toList()).orElse(List.of());
            boolean ambiguous=lastDay.size()>1&&(lastDay.stream().anyMatch(t->t.getTransactionTime()==null)
                ||last.map(t->lastDay.stream().filter(b->Objects.equals(t.getTransactionTime(),b.getTransactionTime())).map(BankTransaction::getBalance).distinct().count()>1).orElse(false));
            String value=ambiguous?null:last.filter(t->t.getBalance()!=null).map(t->amount(t.getBalance())).orElse(null);
            String asOf=last.map(t->t.getTransactionDate()+(ambiguous?" 거래 순서 확인 필요":t.getBalance()==null?" 잔고 미제공":t.getTransactionTime()==null?"":" "+t.getTransactionTime())).orElse(null);
            var registered=independent.get(account.getId());
            var handover=baselines.stream().filter(row->row.getBankAccountId().equals(account.getId())).findFirst().orElse(null);
            var configured=registered!=null?registered:handover;
            // 조회 월 이후의 기초 잔액은 과거 확인 잔고로 사용하지 않으며, 같은 날짜의 마감 잔액은 원본보다 우선합니다.
            var baseline=configured!=null&&!configured.getCutoffDate().isAfter(end)?configured:null;
            if(baseline==null) baseline=handover;
            if(baseline!=null&&(last.isEmpty()||!last.get().getTransactionDate().isAfter(baseline.getCutoffDate()))) {
                value=amount(baseline.getAmount());asOf=baseline.getCutoffDate()+(baseline.getBatchId()==null?" 마감 기초 잔액":" 마감 잔액 인계");
            }
            var calculated=calculateAccountBalance(account.getId(),month,allOpenings,requiredBuildings,allBank,allReceipts);
            accountBalances.add(new BankingBalanceResponse.AccountBalance(account.getId(),account.getBankName()+" ····"+account.getAccountLast4()+(account.getAlias()==null?"":" · "+account.getAlias()),account.getStatus().name(),value,asOf,
                configured==null?null:configured.getCutoffDate(),configured==null?null:amount(configured.getAmount()),registered==null?0:registered.getRevision(),calculated==null?null:amount(calculated.balance()),calculated==null?null:calculated.cutoff()));
        }
        var checkedAccounts=accountBalances.stream().filter(a->selectedAccountId==null||selectedAccountId.equals(a.id())).toList();
        String confirmedBalance=checkedAccounts.isEmpty()||checkedAccounts.stream().anyMatch(a->a.balance()==null)?null:
            checkedAccounts.stream().map(a->new BigDecimal(a.balance())).reduce(BigDecimal.ZERO,BigDecimal::add).toPlainString();
        String confirmedAsOf=checkedAccounts.size()==1?checkedAccounts.getFirst().asOf():"계좌별 확인 시점 기준 합계";
        // 통장 구분 전의 확정값은 버리지 않습니다. 소속을 입증할 수 없는 값은 참고 초안으로만 반환해 사용자가 확인합니다.
        var unassigned=allOpenings.stream().filter(o->o.getBankAccountId()==null).toList();
        var legacyOpening=selectedAccountId!=null&&!unassigned.isEmpty()&&allOpenings.stream().noneMatch(o->o.getBankAccountId()!=null)
            ?new BankingBalanceResponse.LegacyOpening(unassigned.getFirst().getCutoffDate(),unassigned.stream().map(o->new BankingBalanceResponse.LegacyOpeningPart(o.getBuildingId(),amount(o.getAmount()))).toList()):null;
        return new BankingBalanceResponse.Workspace(property,rawMonth,cutoff,confirmedBalance,confirmedAsOf,result,
            entries.stream().filter(e->YearMonth.from(e.date()).equals(month)).toList(),external,income,pending,accountBalances,selectedAccountId,legacyOpening);
    }

    /** 등록일과 실제 사용 근거 중 가장 이른 날부터 조회하며, 잔고 역산만으로 사용 시작을 앞당기지 않습니다. */
    private LocalDate accountAvailableFrom(BankAccount account,List<BuildingCashOpening> saved,List<BankTransaction> bank,List<Payment> receipts,
        List<com.moahome.server.billing.domain.BankOpeningBalance> actualOpenings,boolean onlyAccount) {
        var dates=new ArrayList<LocalDate>();
        dates.add(account.getValidFrom());
        saved.stream().filter(o->account.getId().equals(o.getBankAccountId())||(onlyAccount&&o.getBankAccountId()==null)).map(BuildingCashOpening::getCutoffDate).forEach(dates::add);
        bank.stream().filter(t->account.getId().equals(t.getBankAccountId())).map(BankTransaction::getTransactionDate).forEach(dates::add);
        receipts.stream().filter(p->account.getId().equals(p.getBankAccountId())).map(Payment::getPaymentDate).forEach(dates::add);
        actualOpenings.stream().filter(o->account.getId().equals(o.getBankAccountId())).map(com.moahome.server.billing.domain.BankOpeningBalance::getCutoffDate).forEach(dates::add);
        return dates.stream().min(LocalDate::compareTo).orElseThrow();
    }

    private record AccountCalculation(BigDecimal balance,LocalDate cutoff) {}

    /** 동별 기준값이 모두 있는 통장은 등록 입출금으로 계산하되 은행 파일의 실제 확인 잔액을 덮어쓰지 않습니다. */
    private AccountCalculation calculateAccountBalance(UUID account,YearMonth month,List<BuildingCashOpening> saved,Set<UUID> requiredBuildings,List<BankTransaction> bank,List<Payment> receipts) {
        var own=saved.stream().filter(o->account.equals(o.getBankAccountId())).toList();
        if(own.isEmpty()||!requiredBuildings.stream().allMatch(id->own.stream().anyMatch(o->id.equals(o.getBuildingId())))) return null;
        LocalDate cutoff=own.getFirst().getCutoffDate();
        if(own.stream().anyMatch(o->!cutoff.equals(o.getCutoffDate()))) return null;
        BigDecimal opening=own.stream().map(BuildingCashOpening::getAmount).reduce(BigDecimal.ZERO,BigDecimal::add);
        var movements=new ArrayList<BuildingCashCalculation.Movement>();
        // 통장의 실제 이동은 동별 배분 여부와 무관하므로 미분류 원본·외부 지출·내부 이체도 전액 반영합니다.
        for(var row:bank) {
            if(!account.equals(row.getBankAccountId())) continue;
            movements.add(new BuildingCashCalculation.Movement(row.getTransactionDate(),"INCOME".equals(row.getDirection())?row.getAmount():BigDecimal.ZERO,"EXPENSE".equals(row.getDirection())?row.getAmount():BigDecimal.ZERO));
        }
        // 기존 수동 현금 인식 기준을 유지하고, 원본에 연결된 입금은 위 원본과 중복 합산하지 않습니다.
        for(var receipt:receipts) {
            if(!account.equals(receipt.getBankAccountId())||receipt.getBankTransactionId()!=null||!"MANUAL".equals(receipt.getSourceType())||!"OTHER".equals(receipt.getReceiptType())) continue;
            movements.add(new BuildingCashCalculation.Movement(receipt.getPaymentDate(),receipt.getAmount(),BigDecimal.ZERO));
        }
        return new AccountCalculation(BuildingCashCalculation.calculate(opening,cutoff,month,movements).balance(),cutoff);
    }

    /** 새 통장 기초 잔액과 정정은 통장별 독립 기준일·버전으로 기록하고 동별 보유금·은행 원본을 변경하지 않습니다. */
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void saveAccountOpening(UUID user,UUID property,BankingBalanceRequests.AccountOpening request) {
        lock(user,property);
        var repeated=bankOpenings.findById(request.id());
        if(repeated.isPresent()) {
            var saved=repeated.get();
            if(saved.getBatchId()!=null||!property.equals(saved.getPropertyId())||!user.equals(saved.getRecordedBy())
                ||!request.accountId().equals(saved.getBankAccountId())||!request.cutoffDate().equals(saved.getCutoffDate())
                ||saved.getRevision()!=request.revision()+1||saved.getAmount().compareTo(new BigDecimal(request.amount()))!=0)
                throw new PaymentException("BANK_OPENING_CONFLICT");
            return;
        }
        if(request.cutoffDate().isAfter(today())) throw new PaymentException("INVALID_BANK_OPENING_DATE");
        if(request.amount()==null||!request.amount().matches("[0-9]{1,15}")) throw new PaymentException("INVALID_BANK_OPENING");
        accounts.findById(request.accountId()).filter(a->property.equals(a.getPropertyId())&&a.getDeletedAt()==null&&a.getBuildingId()==null&&a.getStatus()==BankAccountStatus.ACTIVE)
            .orElseThrow(()->new PaymentException("PAYMENT_ACCOUNT_UNAVAILABLE"));
        long revision=bankOpenings.findByPropertyIdAndBatchIdIsNullOrderByRevisionDesc(property).stream()
            .filter(o->o.getBankAccountId().equals(request.accountId())).mapToLong(o->o.getRevision()).max().orElse(0);
        if(revision!=request.revision()) throw new PaymentException("BANK_OPENING_CONFLICT");
        bankOpenings.saveAndFlush(com.moahome.server.billing.domain.BankOpeningBalance.independent(request.id(),property,request.accountId(),request.cutoffDate(),new BigDecimal(request.amount()),revision+1,user,OffsetDateTime.now(clock)));
    }

    /** 통장별 기준값은 같은 관리대상의 공용 통장만 허용하며 종료 통장도 과거 값 정정에 사용할 수 있습니다. */
    private void requireOpeningAccount(UUID property,UUID accountId) {
        if(accountId==null) return; // 이전 인계·API의 미분류 합계는 특정 통장으로 추정하지 않습니다.
        accounts.findById(accountId).filter(a->property.equals(a.getPropertyId())&&a.getDeletedAt()==null&&a.getBuildingId()==null)
            .orElseThrow(()->new PaymentException("PAYMENT_ACCOUNT_UNAVAILABLE"));
    }

    /** 기준일 마감 잔고는 한 번만 등록합니다. 같은 내용 재시도와 이후 추가된 동의 최초 등록만 허용합니다. */
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void saveOpenings(UUID user,UUID property,BankingBalanceRequests.Opening request) {
        lock(user,property);
        var cutoff=request.cutoffDate();
        if(cutoff.isAfter(today())) throw new PaymentException("INVALID_CASH_OPENING_DATE");
        requireOpeningAccount(property,request.accountId());
        var saved=openings.findByPropertyId(property).stream().filter(o->Objects.equals(request.accountId(),o.getBankAccountId())).toList();if(saved.stream().anyMatch(o->!o.getCutoffDate().equals(cutoff))) throw new PaymentException("CASH_OPENING_CONFLICT");
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
            added.add(BuildingCashOpening.create(property,request.accountId(),part.buildingId(),cutoff,part.amount(),user,OffsetDateTime.now(clock)));
        }
        if(!current.stream().allMatch(id->byId.containsKey(id)||seen.contains(id))) throw new PaymentException("INVALID_CASH_OPENING");
        openings.saveAllAndFlush(added);
    }
    /** 기준일과 등록된 모든 동의 마감 잔고를 함께 정정합니다. 기대 버전으로 오래된 화면의 덮어쓰기를 막습니다. */
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void correctOpenings(UUID user,UUID property,BankingBalanceRequests.OpeningCorrection request) {
        lock(user,property);
        requireOpeningAccount(property,request.accountId());
        var repeated=openingChanges.findByRequestId(request.id());
        if(!repeated.isEmpty()) {
            var repeatedByBuilding=repeated.stream().collect(Collectors.toMap(BuildingCashOpeningChange::getBuildingId,c->c));
            var ids=request.buildings().stream().map(BankingBalanceRequests.OpeningCorrectionPart::buildingId).collect(Collectors.toSet());
            if(repeated.size()!=request.buildings().size()||ids.size()!=request.buildings().size()) throw new PaymentException("CASH_OPENING_CONFLICT");
            for(var part:request.buildings()) {
                var change=repeatedByBuilding.get(part.buildingId());
                if(change==null||!property.equals(change.getPropertyId())||!Objects.equals(request.accountId(),change.getBankAccountId())||!request.cutoffDate().equals(change.getNewCutoffDate())
                    ||change.getNewAmount().compareTo(new BigDecimal(part.amount()))!=0||change.getPreviousRevision()!=part.revision())
                    throw new PaymentException("CASH_OPENING_CONFLICT");
            }
            return;
        }
        if(request.cutoffDate().isAfter(today())) throw new PaymentException("INVALID_CASH_OPENING_DATE");
        var saved=openings.findByPropertyId(property).stream().filter(o->Objects.equals(request.accountId(),o.getBankAccountId())).toList();
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
