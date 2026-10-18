package com.moahome.server.banking.service;

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
import com.moahome.server.expense.service.ExpenseService;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.payment.dto.PaymentResponse;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.payment.service.PaymentService;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.repo.*;
import com.moahome.server.property.service.ManagementAccessService;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@Service @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class BankingService {
    private final ManagementAccessService access;
    private final PropertyRepository properties;
    private final BuildingRepository buildings;
    private final BankAccountRepository accounts;
    private final BankTransferRepository transfers;
    private final BankTransactionRepository transactions;
    private final ExpenseRepository expenses;
    private final ExpenseAllocationRepository allocations;
    private final ExpenseService expenseService;
    private final PaymentService payments;
    private final BankTransactionReader reader;
    private final PaymentTextSecurity security;
    private final Clock clock;
    private final IncomeAllocationRepository incomeAllocations;
    private final IncomeAllocationService incomeAllocationService;
    private final com.moahome.server.payment.repo.PaymentRepository receiptRepository;
    private final ExternalSettlementLinkRepository settlementLinks;
    public BankingService(ManagementAccessService access,PropertyRepository properties,BuildingRepository buildings,BankAccountRepository accounts,
        BankTransactionRepository transactions,ExpenseRepository expenses,ExpenseAllocationRepository allocations,ExpenseService expenseService,
        PaymentService payments,BankTransactionReader reader,@Lazy PaymentTextSecurity security,Clock clock,IncomeAllocationRepository incomeAllocations,com.moahome.server.payment.repo.PaymentRepository receiptRepository,ExternalSettlementLinkRepository settlementLinks,BankTransferRepository transfers,IncomeAllocationService incomeAllocationService) {
        this.access=access;this.properties=properties;this.buildings=buildings;this.accounts=accounts;this.transactions=transactions;
        this.expenses=expenses;this.allocations=allocations;this.expenseService=expenseService;this.payments=payments;this.reader=reader;this.security=security;this.clock=clock;this.incomeAllocations=incomeAllocations;this.receiptRepository=receiptRepository;this.settlementLinks=settlementLinks;this.transfers=transfers;this.incomeAllocationService=incomeAllocationService;
    }
    /** 기존 수납과 같은 ADMIN 범위를 사용하며 조회·미리보기·저장 모두 서버에서 확인합니다. */
    private void requireAdmin(UUID user,UUID property) {
        if(access.getManagementContext(user,property).role()!=PropertyMemberRole.ADMIN) throw new AuthException(AuthErrorCode.ACCESS_DENIED);
    }
    private BankAccount account(UUID property) {
        var list=accounts.findByPropertyIdAndDeletedAtIsNull(property).stream().filter(a->a.isPrimary()&&a.getBuildingId()==null&&a.getStatus()==BankAccountStatus.ACTIVE).toList();
        if(list.size()!=1) throw new PaymentException("PAYMENT_ACCOUNT_UNAVAILABLE");return list.getFirst();
    }
    /** 통장 선택은 같은 관리대상의 사용 중인 계좌로 제한하고 기존 호출의 기본값만 유지합니다. */
    private BankAccount account(UUID property,UUID id) {
        if(id==null) return account(property);
        return accounts.findById(id).filter(a -> property.equals(a.getPropertyId()) && a.getDeletedAt()==null && a.getBuildingId()==null && a.getStatus()==BankAccountStatus.ACTIVE)
            .orElseThrow(() -> new PaymentException("PAYMENT_ACCOUNT_UNAVAILABLE"));
    }
    private LocalDate today() { return LocalDate.now(clock.withZone(BillingCalendar.ZONE)); }
    private boolean allowed(Property target,LocalDate date) { return target.getBalanceCutoffDate()==null||date.isAfter(target.getBalanceCutoffDate()); }
    /** 연결 결과로 상태를 구성하며 원본 입출금과 업무 금액을 중복 합산하지 않습니다. */
    public BankingResponse.Workspace workspace(UUID user,UUID property) {
        requireAdmin(user,property);
        var ledger=payments.workspace(user,property);
        var receipts=ledger.payments().stream().filter(p->p.bankTransactionId()!=null).collect(Collectors.toMap(PaymentResponse.Payment::bankTransactionId,p->p,(a,b)->"CANCELED".equals(a.status())?b:a));
        var parts=allocations.findByPropertyIdOrderBySortOrderAsc(property).stream().collect(Collectors.groupingBy(a->a.getExpenseId()));
        var expenseByTransaction=new HashMap<UUID,BankingResponse.Expense>();var rules=new LinkedHashMap<String,BankingResponse.Rule>();
        var originals=transactions.findByPropertyId(property).stream().filter(t->t.getDeletedAt()==null).toList();
        var transferBySource=new HashMap<UUID,UUID>();
        transfers.findByPropertyId(property).stream().filter(t -> t.getCanceledAt()==null).forEach(t -> {
            transferBySource.put(t.getOutgoingId(),t.getId());transferBySource.put(t.getIncomingId(),t.getId());
        });
        var byId=originals.stream().collect(Collectors.toMap(BankTransaction::getId,t->t));
        for(var e:expenses.findByPropertyIdOrderByConfirmedAtDesc(property)) {
            var shares=parts.getOrDefault(e.getId(),List.of()).stream().map(a->new BankingResponse.Allocation(a.getBuildingId(),security.decrypt(a.getTargetLabelEncrypted()),
                a.getAllocatedAmount().toPlainString(),a.getPercentage()==null?null:a.getPercentage().toPlainString())).toList();
            var result=new BankingResponse.Expense(e.getId(),security.decrypt(e.getCategoryEncrypted()),security.decrypt(e.getMemoEncrypted()),e.getAllocationMode(),e.isSaveAsRule(),shares);
            expenseByTransaction.put(e.getBankTransactionId(),result);
            var original=byId.get(e.getBankTransactionId());
            if(e.isSaveAsRule()&&original!=null) rules.putIfAbsent(original.getBankAccountId()+":"+e.getRuleKey(),new BankingResponse.Rule(e.getRuleKey(),original.getBankAccountId(),result.category(),result.mode(),shares));
        }
        var allocatedIncome=incomeAllocations.findByPropertyIdOrderBySortOrderAsc(property).stream().collect(Collectors.groupingBy(IncomeAllocation::getPaymentId));
        var rows=originals.stream().sorted(Comparator.comparing(BankTransaction::getTransactionDate).thenComparing(t->t.getTransactionTime()==null?LocalTime.MIN:t.getTransactionTime()).reversed()).map(t->{
            var payment=receipts.get(t.getId());var expense=expenseByTransaction.get(t.getId());
            String unitId=payment==null?"":payment.unitId();String label=ledger.units().stream().filter(u->u.id().toString().equals(unitId)).map(PaymentResponse.Unit::label).findFirst().orElse("");
            if(payment!=null&&"OTHER".equals(payment.receiptType())) label=payment.incomeCategory();
            return new BankingResponse.Transaction(t.getId(),t.getBankAccountId(),t.getTransactionDate(),t.getTransactionTime(),security.decrypt(t.getPayerNameEncrypted()),security.decrypt(t.getMemoEncrypted()),
                t.getAmount().toPlainString(),t.getBalance()==null?null:t.getBalance().toPlainString(),t.getDirection(),BankTransactionKeys.ruleKey(security.decrypt(t.getPayerNameEncrypted()),security),payment==null?null:payment.id(),
                t.isTransferCandidate()?(transferBySource.containsKey(t.getId())?"TRANSFER":"TRANSFER_PENDING"):expense!=null?"CONFIRMED":payment==null?"PENDING":payment.status(),unitId,label,expense,payment==null||!"CONFIRMED".equals(payment.status())||!allocatedIncome.containsKey(payment.id())?null:
                new BankingResponse.Expense(payment.id(),payment.incomeCategory(),payment.incomeNote(),allocatedIncome.get(payment.id()).getFirst().getAllocationMode(),false,
                    allocatedIncome.get(payment.id()).stream().map(a->new BankingResponse.Allocation(a.getBuildingId(),security.decrypt(a.getBuildingLabelEncrypted()),a.getAmount().toPlainString(),a.getPercentage()==null?null:a.getPercentage().toPlainString())).toList()),payment==null?null:payment.receiptType(),t.isTransferCandidate(),transferBySource.get(t.getId()));
        }).toList();
        var targets=buildings.findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(property).stream().filter(b->b.getStatus()==BuildingStatus.ACTIVE).map(b->new BankingResponse.Building(b.getId(),b.getName())).toList();
        return new BankingResponse.Workspace(property,today(),targets,ledger.units().stream().filter(PaymentResponse.Unit::eligible).map(u->new BankingResponse.Unit(u.id(),u.label())).toList(),rows,List.copyOf(rules.values()),accounts.findByPropertyIdAndDeletedAtIsNull(property).stream()
            .map(a -> new BankingResponse.Account(a.getId(),a.getBankName(),a.getAccountLast4(),a.getAlias(),a.isPrimary(),a.getStatus().name())).toList());
    }
    /** 미리보기는 저장하지 않고 기존 입금 후보와 출금을 한 목록으로 반환합니다. 인계 이전 거래는 따로 셉니다. */
    public BankingResponse.Preview preview(UUID user,UUID property,MultipartFile file) {
        return preview(user,property,file,null);
    }
    public BankingResponse.Preview preview(UUID user,UUID property,MultipartFile file,UUID accountId) {
        requireAdmin(user,property);var account=account(property,accountId);var target=properties.findById(property).orElseThrow();
        var incoming=reader.readAll(file);var receiptCandidates=incoming.stream().anyMatch(r->"INCOME".equals(r.direction()))?payments.preview(user,property,file,account.getId()).rows():List.<PaymentResponse.Payment>of();
        var candidates=receiptCandidates.stream().collect(Collectors.toMap(PaymentResponse.Payment::id,r->r));
        var existing=transactions.findByPropertyId(property).stream().filter(t->t.getDeletedAt()==null&&t.getBankAccountId().equals(account.getId())).map(BankTransaction::getDeduplicationKey).collect(Collectors.toSet());
        int duplicates=0,before=0;var rows=new ArrayList<BankingResponse.Transaction>();
        for(var row:incoming) {
            if(row.date().isAfter(today())) throw new PaymentException("INVALID_PAYMENT_DATE");
            if(!allowed(target,row.date())) { before++;continue; }
            String key=BankTransactionKeys.key(row,security);UUID id=BankTransactionKeys.previewId(key);
            if(!existing.add(key)) { duplicates++;continue; }
            var candidate=candidates.get(id);
            rows.add(new BankingResponse.Transaction(id,account.getId(),row.date(),row.time(),row.payer(),row.memo(),row.amount().toPlainString(),row.balance()==null?null:row.balance().toPlainString(),row.direction(),BankTransactionKeys.ruleKey(row.payer(),security),null,"PENDING",candidate==null?"":candidate.unitId(),"",null,null,null));
        }
        return new BankingResponse.Preview(property,rows,duplicates,before);
    }
    /** 선택 전체를 원본 파일로 재검증하고 같은 관리대상 잠금 안에서 수납·지출을 원자적으로 저장합니다. */
    @Transactional
    public BankingResponse.Workspace upload(UUID user,UUID property,MultipartFile file,BankingRequests.Import selection) {
        requireAdmin(user,property);
        var target=properties.findForUnitUpdate(property).orElseThrow(()->new AuthException(AuthErrorCode.ACCESS_DENIED));requireAdmin(user,property);
        if(target.getManagementStartedAt()==null) throw new PaymentException("OPENING_BALANCE_REQUIRED");
        var account=account(property,selection.accountId());var source=reader.readAll(file);var available=new LinkedHashMap<UUID,BankTransactionReader.Row>();
        for(var row:source) {
            if(row.date().isAfter(today())) throw new PaymentException("INVALID_PAYMENT_DATE");
            available.putIfAbsent(BankTransactionKeys.previewId(BankTransactionKeys.key(row,security)),row);
        }
        var choices=new LinkedHashMap<UUID,PaymentService.BankReceiptChoice>();var income=new ArrayList<BankTransactionReader.Row>();var selected=new HashSet<UUID>();
        for(var item:selection.rows()) {
            var row=available.get(item.id());
            if(row==null||!selected.add(item.id())||!allowed(target,row.date())) throw new PaymentException("INVALID_BANK_SELECTION");
            if(item.transfer()) {
                if(item.expense()!=null || item.incomeAllocation()!=null || item.unitId()!=null || item.incomeCategory()!=null || item.incomeNote()!=null) throw new PaymentException("INVALID_BANK_SELECTION");
                saveTransferSource(property,account.getId(),row,user);
                continue;
            }
            if("INCOME".equals(row.direction())) {
                if(item.expense()!=null||(item.unitId()!=null&&item.incomeCategory()!=null)||(item.incomeAllocation()!=null&&(item.unitId()!=null||item.incomeCategory()==null))) throw new PaymentException("INVALID_BANK_SELECTION");
                income.add(row);choices.put(item.id(),new PaymentService.BankReceiptChoice(item.unitId(),item.incomeCategory(),item.incomeNote()));continue;
            }
            if(item.unitId()!=null||item.incomeCategory()!=null||item.incomeNote()!=null||item.incomeAllocation()!=null) throw new PaymentException("INVALID_BANK_SELECTION");
            String key=BankTransactionKeys.key(row,security);
            var previous=transactions.findByBankAccountIdAndDeduplicationKeyAndDeletedAtIsNull(account.getId(),key);
            BankTransaction original;
            if(previous.isPresent()) original=previous.get();
            else {
                original=BankTransaction.create(property,account.getId(),row.date(),row.amount(),security.protect(row.payer()).encrypted(),security.nameHash(row.payer()),
                    row.memo()==null?null:security.protect(row.memo()).encrypted(),row.reference(),key,user,OffsetDateTime.now(clock),row.time(),row.balance());
                original.markExpense();original=transactions.saveAndFlush(original);
            }
            if(item.expense()!=null) expenseService.confirm(original,item.expense(),user);
        }
        if(!income.isEmpty()) payments.importBankRows(user,property,income,choices,account.getId());
        for(var item:selection.rows()) {
            if(item.incomeAllocation()==null) continue;
            var original=transactions.findByBankAccountIdAndDeduplicationKeyAndDeletedAtIsNull(account.getId(),BankTransactionKeys.key(available.get(item.id()),security)).orElseThrow();
            allocateIncome(original,item.incomeAllocation(),user);
        }
        return workspace(user,property);
    }
    /** 내부 이체 선택은 자동 수납·지출 분류를 거치지 않고 은행 원본만 계좌별로 저장합니다. */
    private void saveTransferSource(UUID property,UUID account,BankTransactionReader.Row row,UUID user) {
        var key=BankTransactionKeys.key(row,security);
        var previous=transactions.findByBankAccountIdAndDeduplicationKeyAndDeletedAtIsNull(account,key);
        if(previous.isPresent()) {
            if(!previous.get().isTransferCandidate()) throw new PaymentException("BANK_TRANSFER_CONFLICT");
            return;
        }
        var original=BankTransaction.create(property,account,row.date(),row.amount(),security.protect(row.payer()).encrypted(),security.nameHash(row.payer()),
            row.memo()==null?null:security.protect(row.memo()).encrypted(),row.reference(),key,user,OffsetDateTime.now(clock),row.time(),row.balance());
        if("EXPENSE".equals(row.direction())) original.markExpense();
        original.markTransferCandidate();
        transactions.saveAndFlush(original);
    }

    /** 저장된 미분류 출금도 같은 검증과 잠금으로 확정합니다. 이미 확정된 배분은 덮어쓰지 않습니다. */
    @Transactional
    public BankingResponse.Workspace confirmExpense(UUID user,UUID property,UUID id,BankingRequests.Expense request) {
        requireAdmin(user,property);properties.findForUnitUpdate(property).orElseThrow(()->new AuthException(AuthErrorCode.ACCESS_DENIED));requireAdmin(user,property);
        var original=transactions.findById(id).filter(t->property.equals(t.getPropertyId())&&t.getDeletedAt()==null).orElseThrow(()->new PaymentException("BANK_TRANSACTION_NOT_FOUND"));
        expenseService.confirm(original,request,user);return workspace(user,property);
    }
    /** 확정 기타 입금의 전액을 실제 관리 동에 나눕니다. 외부 회수와 이중으로 사용하지 않습니다. */
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public BankingResponse.Workspace confirmIncomeAllocation(UUID user,UUID property,UUID transactionId,BankingRequests.Expense request) {
        requireAdmin(user,property);properties.findForUnitUpdate(property).orElseThrow(()->new AuthException(AuthErrorCode.ACCESS_DENIED));requireAdmin(user,property);
        var original=transactions.findById(transactionId).filter(t->property.equals(t.getPropertyId())&&t.getDeletedAt()==null).orElseThrow(()->new PaymentException("BANK_TRANSACTION_NOT_FOUND"));
        allocateIncome(original,request,user);return workspace(user,property);
    }
    /** 같은 배분 재시도는 이중 저장하지 않으며 당시 동 이름·금액을 변경 불가 이력으로 남깁니다. */
    private void allocateIncome(BankTransaction original,BankingRequests.Expense request,UUID user) {
        if(original.isTransferCandidate()) throw new PaymentException("BANK_TRANSFER_CONFLICT");
        if(!"INCOME".equals(original.getDirection())||original.getDeletedAt()!=null||request.saveAsRule()) throw new PaymentException("INVALID_BANK_SELECTION");
        var property=original.getPropertyId();
        var receipt=receiptRepository.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(property).stream()
            .filter(p->original.getId().equals(p.getBankTransactionId())&&p.getDeletedAt()==null&&"CONFIRMED".equals(p.getStatus())&&"OTHER".equals(p.getReceiptType()))
            .findFirst().orElseThrow(()->new PaymentException("OTHER_INCOME_REQUIRED"));
        incomeAllocationService.allocate(receipt,request,user);
    }

    /** 같은 대상의 서로 다른 통장·동일 금액·반대 방향의 대기 원본만 연결합니다. */
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public BankingResponse.Workspace connectTransfer(UUID user,UUID property,BankingRequests.Transfer request) {
        requireAdmin(user,property);properties.findForUnitUpdate(property).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));requireAdmin(user,property);
        var previous=transfers.findById(request.id());
        if(previous.isPresent()) {
            var saved=previous.get();
            if(!property.equals(saved.getPropertyId()) || !request.outgoingId().equals(saved.getOutgoingId()) || !request.incomingId().equals(saved.getIncomingId())) throw new PaymentException("BANK_TRANSFER_CONFLICT");
            return workspace(user,property);
        }
        var outgoing=transferSource(property,request.outgoingId());var incoming=transferSource(property,request.incomingId());
        if(!"EXPENSE".equals(outgoing.getDirection()) || !"INCOME".equals(incoming.getDirection()) || outgoing.getBankAccountId().equals(incoming.getBankAccountId())
            || outgoing.getAmount().compareTo(incoming.getAmount())!=0) throw new PaymentException("BANK_TRANSFER_CONFLICT");
        var used=transfers.findByPropertyId(property).stream().filter(t -> t.getCanceledAt()==null).toList();
        if(used.stream().anyMatch(t -> t.getOutgoingId().equals(outgoing.getId()) || t.getIncomingId().equals(incoming.getId()))) throw new PaymentException("BANK_TRANSFER_CONFLICT");
        transfers.saveAndFlush(BankTransfer.connect(request.id(),property,outgoing.getId(),incoming.getId(),user,OffsetDateTime.now(clock)));
        return workspace(user,property);
    }
    private BankTransaction transferSource(UUID property,UUID id) {
        return transactions.findById(id).filter(t -> property.equals(t.getPropertyId()) && t.getDeletedAt()==null && t.isTransferCandidate())
            .orElseThrow(() -> new PaymentException("BANK_TRANSFER_CONFLICT"));
    }
    /** 잘못 연결한 이체만 취소하고 원본과 연결 이력을 보존합니다. 재시도는 무효과입니다. */
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public BankingResponse.Workspace cancelTransfer(UUID user,UUID property,UUID id) {
        requireAdmin(user,property);properties.findForUnitUpdate(property).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));requireAdmin(user,property);
        var transfer=transfers.findById(id).filter(t -> property.equals(t.getPropertyId())).orElseThrow(() -> new PaymentException("BANK_TRANSFER_CONFLICT"));
        transfer.cancel(user,OffsetDateTime.now(clock));transfers.flush();
        return workspace(user,property);
    }

    /** 선택 전체의 소속을 먼저 검증하고 연결 수납을 취소한 뒤 원본을 소프트 삭제해 재업로드를 허용합니다. */
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public BankingResponse.Workspace deleteMany(UUID user,UUID property,BankingRequests.DeleteMany request) {
        requireAdmin(user,property);
        properties.findForUnitUpdate(property).orElseThrow(()->new AuthException(AuthErrorCode.ACCESS_DENIED));requireAdmin(user,property);
        var ids=new LinkedHashSet<>(request.transactionIds());
        var selected=transactions.findAllById(ids);
        if(selected.size()!=ids.size()||selected.stream().anyMatch(t->!property.equals(t.getPropertyId())))
            throw new PaymentException("BANK_TRANSACTION_NOT_FOUND");
        // 연결된 이체는 양쪽을 함께 삭제해야 상대 통장에 설명 없는 단독 거래가 남지 않습니다.
        if(transfers.findByPropertyId(property).stream().anyMatch(t -> t.getCanceledAt()==null
            && (ids.contains(t.getOutgoingId()) != ids.contains(t.getIncomingId())))) throw new PaymentException("BANK_TRANSFER_DELETE_PAIR_REQUIRED");
        // 은행 원본과 수동 수납 선택은 구분하며 다른 대상·은행 연결 수납은 수동 삭제로 우회하지 못합니다.
        var manualIds=new LinkedHashSet<>(request.paymentIds());
        var manual=receiptRepository.findAllById(manualIds);
        if(manual.size()!=manualIds.size()||manual.stream().anyMatch(p->!property.equals(p.getPropertyId())))
            throw new PaymentException("PAYMENT_NOT_FOUND");
        if(manual.stream().anyMatch(p->!"MANUAL".equals(p.getSourceType())||p.getBankTransactionId()!=null))
            throw new PaymentException("PAYMENT_DELETE_NOT_ALLOWED");
        // 한 선택이라도 삭제 불가이면 은행 원본 취소까지 모두 롤백합니다. 취소 사유와 수납 이벤트는 보존합니다.
        if(!manualIds.isEmpty()) payments.removeManualReceipts(user,property,manualIds);
        // 확정 수납·충당은 기존 취소 흐름과 같은 이력을 남깁니다. 출금 분류·배분은 원본과 함께 보관합니다.
        payments.removeBankReceipts(user,property,ids);
        var at=OffsetDateTime.now(clock);
        selected.forEach(t->t.softDelete(user,at));
        transactions.flush();
        return workspace(user,property);
    }

}
