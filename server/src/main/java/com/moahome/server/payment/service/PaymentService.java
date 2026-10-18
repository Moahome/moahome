package com.moahome.server.payment.service;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import java.util.stream.Collectors;
import com.moahome.server.auth.exception.*;
import com.moahome.server.banking.domain.*;
import com.moahome.server.banking.repo.*;
import com.moahome.server.banking.service.BankTransactionReader;
import com.moahome.server.billing.domain.*;
import com.moahome.server.billing.repo.*;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.payment.domain.*;
import com.moahome.server.payment.dto.*;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.payment.repo.*;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.repo.*;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.resident.dto.ResidentListResponse.ResidentItem;
import com.moahome.server.resident.service.ResidentListService;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@Service
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class PaymentService {
    private final ManagementAccessService access;
    private final ResidentListService residents;
    private final PropertyRepository properties;
    private final UnitRepository units;
    private final BuildingRepository buildings;
    private final ChargeRepository charges;
    private final BillingPeriodRepository periods;
    private final BankAccountRepository accounts;
    private final BankTransactionRepository transactions;
    private final PaymentRepository payments;
    private final PaymentAllocationRepository allocations;
    private final PaymentEventRepository events;
    private final PaymentTextSecurity security;
    private final BankTransactionReader reader;
    private final Clock clock;
    private final CumulativePaymentService cumulative;
    private final OpeningBalanceBatchRepository openingBatches;
    private final OpeningBalanceItemRepository openingItems;
    private final CreditApplicationRepository creditApplications;
    public PaymentService(ManagementAccessService access,ResidentListService residents,PropertyRepository properties,
        UnitRepository units,BuildingRepository buildings,ChargeRepository charges,BillingPeriodRepository periods,
        BankAccountRepository accounts,BankTransactionRepository transactions,PaymentRepository payments,
        PaymentAllocationRepository allocations,PaymentEventRepository events,@Lazy PaymentTextSecurity security,
        BankTransactionReader reader,Clock clock,CumulativePaymentService cumulative,OpeningBalanceBatchRepository openingBatches,
        OpeningBalanceItemRepository openingItems,CreditApplicationRepository creditApplications) {
        this.access=access;this.residents=residents;this.properties=properties;this.units=units;this.buildings=buildings;
        this.charges=charges;this.periods=periods;this.accounts=accounts;this.transactions=transactions;this.payments=payments;
        this.allocations=allocations;this.events=events;this.security=security;this.reader=reader;this.clock=clock;this.cumulative=cumulative;
        this.openingBatches=openingBatches;this.openingItems=openingItems;this.creditApplications=creditApplications;
    }
    /** 현재 대표 명부를 포함하므로 부담당자가 아닌 관리소장 권한을 매 요청마다 검사합니다. */
    private void requireAdmin(UUID user,UUID property) {
        if (access.getManagementContext(user,property).role()!=PropertyMemberRole.ADMIN) throw new AuthException(AuthErrorCode.ACCESS_DENIED);
    }
    /** 세대 변경·청구 생성과 같은 관리대상 잠금을 사용해 최신 잔액 검증과 저장을 직렬화합니다. */
    private void lock(UUID user,UUID property) {
        requireAdmin(user,property);
        var target=properties.findForUnitUpdate(property).orElseThrow(()->new AuthException(AuthErrorCode.ACCESS_DENIED));
        requireAdmin(user,property);
        if(target.getManagementStartedAt()==null) throw new PaymentException("OPENING_BALANCE_REQUIRED");
    }
    private OffsetDateTime now() { return OffsetDateTime.now(clock); }
    private LocalDate today() { return LocalDate.now(clock.withZone(BillingCalendar.ZONE)); }
    private Map<UUID,ResidentItem> representatives(UUID user,UUID property) {
        return residents.list(user,property).residents().stream().filter(r->r.representative()&&r.unitId()!=null)
            .collect(Collectors.toMap(ResidentItem::unitId,r->r));
    }
    private List<BankAccount> propertyAccounts(UUID property) {
        return accounts.findByPropertyIdAndDeletedAtIsNull(property);
    }
    /** 현재 확정된 공용 기본 계좌만 사용하며 계좌가 없거나 여러 개면 임의로 선택하지 않습니다. */
    private BankAccount primary(UUID property) {
        var candidates=propertyAccounts(property).stream().filter(a->a.isPrimary()&&a.getBuildingId()==null&&a.getStatus()==BankAccountStatus.ACTIVE).toList();
        if (candidates.size()!=1) throw new PaymentException("PAYMENT_ACCOUNT_UNAVAILABLE");
        return candidates.getFirst();
    }
    private Map<UUID,Building> currentBuildings(UUID property) {
        return buildings.findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(property).stream()
            .filter(b->b.getStatus()==BuildingStatus.ACTIVE).collect(Collectors.toMap(Building::getId,b->b));
    }
    private boolean eligible(Unit unit,Map<UUID,Building> current) {
        return unit.getDeletedAt()==null&&unit.getStatus()==UnitStatus.ACTIVE&&(unit.getBuildingId()==null||current.containsKey(unit.getBuildingId()));
    }
    /** 읽기는 실제 명부·발행 청구·수납만 반환하고 미발행 예정액이나 예시 세대를 생성하지 않습니다. */
    public PaymentResponse.Ledger workspace(UUID user,UUID property) {
        requireAdmin(user,property);
        return ledger(user,property);
    }
    private PaymentResponse.Ledger ledger(UUID user,UUID property) {
        var residentRows=residents.list(user,property).residents();
        var reps=residentRows.stream().filter(r->r.representative()&&r.unitId()!=null).collect(Collectors.toMap(ResidentItem::unitId,r->r));
        var current=currentBuildings(property);
        var periodsById=periods.findByPropertyIdOrderByBillingYearDescBillingMonthDesc(property).stream()
            .filter(p->"ISSUED".equals(p.getStatus())).collect(Collectors.toMap(BillingPeriod::getId,p->p));
        var headers=charges.findByPropertyId(property).stream().filter(c->"OPENING_RECEIVABLE".equals(c.getChargeType()) || periodsById.containsKey(c.getBillingPeriodId())).toList();
        var allPayments=payments.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(property).stream().filter(p->p.getDeletedAt()==null).toList();
        var paymentUnits=allPayments.stream().map(Payment::getMatchedUnitId).filter(Objects::nonNull).collect(Collectors.toSet());
        var chargedUnits=headers.stream().map(Charge::getUnitId).collect(Collectors.toSet());
        var openingUnits=openingItems.findByPropertyId(property).stream().map(i->i.getUnitId()).collect(Collectors.toSet());
        var allUnits=units.findByPropertyId(property).stream().filter(u->u.getDeletedAt()==null||chargedUnits.contains(u.getId())||paymentUnits.contains(u.getId())||openingUnits.contains(u.getId())).toList();
        var live=allUnits.stream().filter(u->eligible(u,current)).map(Unit::getId).collect(Collectors.toSet());
        var unitRows=allUnits.stream().map(u->{
            var rep=reps.get(u.getId());
            String building=u.getBuildingId()==null?"":current.containsKey(u.getBuildingId())?current.get(u.getBuildingId()).getName():
                headers.stream().filter(c->c.getUnitId().equals(u.getId())).map(Charge::getBuildingName).findFirst().orElse("");
            return new PaymentResponse.Unit(u.getId(),(building.isEmpty()?"":building+" ")+u.getUnitNumber()+"호",
                u.getStatus()==UnitStatus.ACTIVE?"ACTIVE":"VACANT",live.contains(u.getId()),rep==null?null:rep.id(),rep==null?null:rep.name(),residentRows.stream().filter(r->u.getId().equals(r.unitId())).map(ResidentItem::name).distinct().sorted().toList(),building);
        }).sorted(Comparator.comparing(PaymentResponse.Unit::label)).toList();
        var chargeRows=headers.stream().map(c->{
            var month="OPENING_RECEIVABLE".equals(c.getChargeType())?YearMonth.from(c.getDueDate()):periodsById.get(c.getBillingPeriodId()).month();
            String state=c.getStatus();
            if ("MONTHLY".equals(c.getChargeType())&&"ISSUED".equals(state)&&!month.isBefore(YearMonth.from(today()))&&!live.contains(c.getUnitId())) state="EXCLUDED_VACANT";
            return new PaymentResponse.Charge(c.getId(),c.getUnitId(),month.toString(),c.getTotalAmount().toPlainString(),state,c.getDueDate(),c.getChargeType());
        }).filter(c->!"DRAFT".equals(c.status())).toList();
        var applied=allocations.findByPropertyId(property).stream().collect(Collectors.groupingBy(PaymentAllocation::getPaymentId));
        var paymentRows=allPayments.stream()
            .map(p->response(p,applied.getOrDefault(p.getId(),List.of()),unitRows,residentRows)).toList();
        var accountRows=propertyAccounts(property).stream().sorted(Comparator.comparing((BankAccount a)->a.isPrimary()&&a.getStatus()==BankAccountStatus.ACTIVE).reversed()).map(a->new PaymentResponse.Account(a.getId(),a.getBankName()+" ····"+a.getAccountLast4())).toList();
        var confirmedOpening=openingBatches.findByPropertyIdOrderByCreatedAtDesc(property).stream().filter(b->"CONFIRMED".equals(b.getStatus()))
            .collect(Collectors.toMap(b->b.getId(),b->b));
        var credits=creditApplications.findByPropertyId(property).stream().filter(a->"ACTIVE".equals(a.getStatus()))
            .collect(Collectors.groupingBy(a->a.getOpeningItemId()));
        var openingRows=openingItems.findByPropertyId(property).stream().filter(i->confirmedOpening.containsKey(i.getBatchId())&&i.getCredit().signum()>0)
            .map(i->new PaymentResponse.OpeningCredit(i.getId(),i.getUnitId(),confirmedOpening.get(i.getBatchId()).getCutoffDate(),i.getCredit().toPlainString(),
                credits.getOrDefault(i.getId(),List.of()).stream().map(a->new PaymentResponse.Allocation(a.getChargeId(),a.getAmount().toPlainString())).toList())).toList();
        return new PaymentResponse.Ledger(property,today(),accountRows,unitRows,chargeRows,paymentRows,List.of(),openingRows);
    }
    private PaymentResponse.Payment response(Payment p,List<PaymentAllocation> applied,List<PaymentResponse.Unit> unitRows,List<ResidentItem> residentRows) {
        String payer=security.decrypt(p.getPayerNameEncrypted());
        UUID unit=p.getMatchedUnitId();
        String reason="";
        if (unit==null&&"PENDING".equals(p.getStatus())) {
            unit=unitCandidate(payer,unitRows,residentRows);
            if(unit!=null) reason=candidateReason(payer,unitRows);
        }
        return new PaymentResponse.Payment(p.getId(),p.getSourceType(),p.getStatus(),p.getBankAccountId(),p.getPaymentDate(),payer,
            p.getAmount().toPlainString(),unit==null?"":unit.toString(),reason,
            applied.stream().filter(a->"CANCELED".equals(p.getStatus())||"ACTIVE".equals(a.getStatus()))
                .map(a->new PaymentResponse.Allocation(a.getChargeId(),a.getAllocatedAmount().toPlainString())).toList(),
            p.getLinkedPaymentId(),p.getBankTransactionId(),security.decrypt(p.getHoldReasonEncrypted()),security.decrypt(p.getCancelReasonEncrypted()),
            security.decrypt(p.getSeparateReasonEncrypted()),security.decrypt(p.getMemoEncrypted()),p.getReceiptType(),
            security.decrypt(p.getIncomeCategoryEncrypted()),security.decrypt(p.getIncomeNoteEncrypted()));
    }
    /** 이름 또는 동·호수가 현재 명단의 한 세대와 일치할 때만 연결하며 여러 세대에 걸친 동명이인은 남겨 둡니다. */
    private UUID unitCandidate(String payer,List<PaymentResponse.Unit> unitRows,List<ResidentItem> residentRows) {
        String hash=security.nameHash(payer);
        Set<UUID> eligible=unitRows.stream().filter(PaymentResponse.Unit::eligible).map(PaymentResponse.Unit::id).collect(Collectors.toSet());
        Set<UUID> matches=unitRows.stream().filter(u->eligible.contains(u.id())&&matchesUnitLabel(hash,u.label()))
            .map(PaymentResponse.Unit::id).collect(Collectors.toSet());
        residentRows.stream().filter(r->r.unitId()!=null&&eligible.contains(r.unitId())&&security.nameHash(r.name()).equals(hash))
            .map(ResidentItem::unitId).forEach(matches::add);
        return matches.size()==1?matches.iterator().next():null;
    }
    /** 세대 표기의 마지막 '호'만 생략할 수 있게 하며 이름 비교와 은행 중복 키의 원문 기준은 유지합니다. */
    private boolean matchesUnitLabel(String payerHash,String label) {
        if (security.nameHash(label).equals(payerHash)) return true;
        return label.endsWith("호")&&security.nameHash(label.substring(0,label.length()-1)).equals(payerHash);
    }
    private String candidateReason(String payer,List<PaymentResponse.Unit> unitRows) {
        String hash=security.nameHash(payer);
        return unitRows.stream().anyMatch(u->matchesUnitLabel(hash,u.label()))?"동·호수 일치":"명단 이름 일치";
    }
    /** 파일 가져오기 또는 일치 입금 일괄 처리에서만 자동 확정하며 수동 수납 중복 의심과 보류는 검토 대상으로 유지합니다. */
    private boolean confirmMatched(UUID user,UUID property,Payment payment,List<PaymentResponse.Unit> unitRows,List<ResidentItem> residentRows) {
        if(payment.getDeletedAt()!=null||!"BANK_IMPORT".equals(payment.getSourceType())||!"PENDING".equals(payment.getStatus())) return false;
        if(!afterCutoff(property,payment.getPaymentDate())) return false;
        String payer=security.decrypt(payment.getPayerNameEncrypted());
        UUID candidate=unitCandidate(payer,unitRows,residentRows);
        if(candidate==null||!duplicates(property,payment).isEmpty()) return false;
        // 관리자가 취소한 원본 검토 초안은 명단이 일치해도 다시 자동 납부 처리하지 않습니다.
        if(payments.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(property).stream().anyMatch(p->"CANCELED".equals(p.getStatus())
            &&Objects.equals(p.getBankTransactionId(),payment.getBankTransactionId()))) return false;
        var rep=residentRows.stream().filter(r->candidate.equals(r.unitId())&&security.nameHash(r.name()).equals(payment.getPayerNameHmac())).findFirst();
        payment.confirm(candidate,rep.map(ResidentItem::id).orElse(null),null,user,now());
        payment.assignCashBuilding(units.findById(candidate).orElseThrow(()->new PaymentException("PAYMENT_UNIT_UNAVAILABLE")).getBuildingId());
        audit(payment,"AUTO_CONFIRMED",candidateReason(payer,unitRows),user);
        return true;
    }
    /** 이미 업로드한 확인 필요 입금도 명단의 유일한 일치 세대를 다시 검사해 한 번에 확정합니다. */
    @Transactional
    public PaymentResponse.Ledger confirmMatches(UUID user,UUID property) {
        lock(user,property);
        var snapshot=ledger(user,property);var residentRows=residents.list(user,property).residents();
        for(var payment:payments.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(property))
            confirmMatched(user,property,payment,snapshot.units(),residentRows);
        payments.flush();cumulative.settle(property,user);
        return ledger(user,property);
    }
    private Payment requirePayment(UUID property,UUID id) {
        return payments.findById(id).filter(p->p.getPropertyId().equals(property)&&p.getDeletedAt()==null).orElseThrow(()->new PaymentException("PAYMENT_NOT_FOUND"));
    }
    private ResidentItem representative(UUID user,UUID property,UUID unit) {
        var selected=units.findByIdAndPropertyIdAndDeletedAtIsNull(unit,property).orElseThrow(()->new PaymentException("PAYMENT_UNIT_UNAVAILABLE"));
        if (!eligible(selected,currentBuildings(property))) throw new PaymentException("PAYMENT_UNIT_UNAVAILABLE");
        var rep=representatives(user,property).get(unit);
        if (rep==null) throw new PaymentException("PAYMENT_REPRESENTATIVE_REQUIRED");
        return rep;
    }
    /** 수동 입력의 입금자명은 현재 선택 세대의 대표에서 가져오고 같은 요청 ID 재전송은 중복 등록하지 않습니다. */
    @Transactional
    public PaymentResponse.Ledger manual(UUID user,UUID property,PaymentRequests.Manual request) {
        lock(user,property);
        requireAfterCutoff(property,request.date());
        var amount=amount(request.amount(),true);
        if (request.date().isAfter(today())) throw new PaymentException("INVALID_PAYMENT_DATE");
        var existing=payments.findById(request.id());
        if (existing.isPresent()) {
            var p=existing.get();
            if (!p.getPropertyId().equals(property)||!p.getCreatedBy().equals(user)||!"MANUAL".equals(p.getSourceType())
                ||!Objects.equals(p.getMatchedUnitId(),request.unitId())||!p.getPaymentDate().equals(request.date())||p.getAmount().compareTo(amount)!=0)
                throw new PaymentException("PAYMENT_REQUEST_CONFLICT");
            return ledger(user,property);
        }
        var rep=representative(user,property,request.unitId());
        var protectedName=security.protect(rep.name());
        var p=Payment.pending(request.id(),property,primary(property).getId(),null,request.unitId(),rep.id(),request.date(),amount,"MANUAL",
            protectedName.encrypted(),security.nameHash(rep.name()),null,user,now());
        payments.saveAndFlush(p); audit(p,"CREATED",null,user);
        return ledger(user,property);
    }
    /** 청구의 실제 상태·세대·최신 배분 잔액을 잠금 아래 다시 검사해 동시 과배분을 막습니다. */
    @Transactional
    public PaymentResponse.Ledger confirm(UUID user,UUID property,UUID id,PaymentRequests.Confirm request) {
        lock(user,property);
        var payment=requirePayment(property,id);
        requireAfterCutoff(property,payment.getPaymentDate());
        if(request.allocations()==null) return confirmCumulative(user,property,payment,request);
        Map<UUID,BigDecimal> wanted=new LinkedHashMap<>();
        for (var item:request.allocations()) {
            var value=amount(item.amount(),false);
            if (wanted.putIfAbsent(item.chargeId(),value)!=null) throw new PaymentException("PAYMENT_ALLOCATION_INVALID");
        }
        wanted.entrySet().removeIf(e->e.getValue().signum()==0);
        var saved=allocations.findByPropertyId(property);
        if ("CONFIRMED".equals(payment.getStatus())) {
            var same=saved.stream().filter(a->a.getPaymentId().equals(id)&&"ACTIVE".equals(a.getStatus()))
                .collect(Collectors.toMap(PaymentAllocation::getChargeId,PaymentAllocation::getAllocatedAmount));
            if (!Objects.equals(payment.getMatchedUnitId(),request.unitId())||!same.equals(wanted)
                ||!Objects.equals(separate(request.separateReason()),security.decrypt(payment.getSeparateReasonEncrypted())))
                throw new PaymentException("PAYMENT_REQUEST_CONFLICT");
            return ledger(user,property);
        }
        if (!"PENDING".equals(payment.getStatus())) throw new PaymentException("PAYMENT_STATE_CONFLICT");
        var selectedUnit=units.findById(request.unitId()).filter(u->u.getPropertyId().equals(property))
            .orElseThrow(()->new PaymentException("PAYMENT_UNIT_UNAVAILABLE"));
        var rep=representatives(user,property).get(request.unitId());
        var active=saved.stream().filter(a->"ACTIVE".equals(a.getStatus())).collect(Collectors.groupingBy(PaymentAllocation::getChargeId,
            Collectors.reducing(BigDecimal.ZERO,PaymentAllocation::getAllocatedAmount,BigDecimal::add)));
        creditApplications.findByPropertyId(property).stream().filter(a->"ACTIVE".equals(a.getStatus()))
            .forEach(a->active.merge(a.getChargeId(),a.getAmount(),BigDecimal::add));
        var headers=charges.findByPropertyId(property).stream().collect(Collectors.toMap(Charge::getId,c->c));
        var periodMap=periods.findByPropertyIdOrderByBillingYearDescBillingMonthDesc(property).stream().collect(Collectors.toMap(BillingPeriod::getId,p->p));
        BigDecimal total=BigDecimal.ZERO;
        for (var entry:wanted.entrySet()) {
            var charge=headers.get(entry.getKey());
            var period=charge==null?null:periodMap.get(charge.getBillingPeriodId());
            if (charge==null||period==null||!"ISSUED".equals(period.getStatus())||!"ISSUED".equals(charge.getStatus())
                ||charge.getTotalAmount().signum()<=0||!charge.getUnitId().equals(request.unitId())
                ||(!period.month().isBefore(YearMonth.from(today()))&&!eligible(selectedUnit,currentBuildings(property)))
                ||period.getBillingDate().isAfter(payment.getPaymentDate())
                ||entry.getValue().compareTo(charge.getTotalAmount().subtract(active.getOrDefault(charge.getId(),BigDecimal.ZERO)))>0)
                throw new PaymentException("PAYMENT_ALLOCATION_INVALID");
            total=total.add(entry.getValue());
        }
        if (total.signum()<=0||total.compareTo(payment.getAmount())>0) throw new PaymentException("PAYMENT_ALLOCATION_INVALID");
        if (!duplicates(property,payment).isEmpty()&&separate(request.separateReason())==null) throw new PaymentException("PAYMENT_DUPLICATE_REVIEW_REQUIRED");
        String reason=separate(request.separateReason());
        var at=now(); payment.confirm(request.unitId(),"MANUAL".equals(payment.getSourceType())?payment.getPayerResidentId():rep==null?null:rep.id(),reason==null?null:security.protect(reason).encrypted(),user,at);
        payment.assignCashBuilding(selectedUnit.getBuildingId());
        payments.flush();
        allocations.saveAllAndFlush(wanted.entrySet().stream().map(e->PaymentAllocation.allocate(payment,e.getKey(),e.getValue(),user,at)).toList());
        audit(payment,"CONFIRMED",reason,user);
        return ledger(user,property);
    }
    /** 세대만 지정하면 입금 전액을 누적 수납하고 청구월 입력 없이 누적 미납을 충당합니다. 전액 선입금도 허용합니다. */
    private PaymentResponse.Ledger confirmCumulative(UUID user,UUID property,Payment payment,PaymentRequests.Confirm request) {
        String reason=separate(request.separateReason());
        if("CONFIRMED".equals(payment.getStatus())) {
            if(!Objects.equals(payment.getMatchedUnitId(),request.unitId())
                ||!Objects.equals(reason,security.decrypt(payment.getSeparateReasonEncrypted()))) throw new PaymentException("PAYMENT_REQUEST_CONFLICT");
            return ledger(user,property);
        }
        if(!"PENDING".equals(payment.getStatus())) throw new PaymentException("PAYMENT_STATE_CONFLICT");
        var unit=units.findByIdAndPropertyIdAndDeletedAtIsNull(request.unitId(),property)
            .orElseThrow(()->new PaymentException("PAYMENT_UNIT_UNAVAILABLE"));
        if(!eligible(unit,currentBuildings(property))) throw new PaymentException("PAYMENT_UNIT_UNAVAILABLE");
        if(!duplicates(property,payment).isEmpty()&&reason==null) throw new PaymentException("PAYMENT_DUPLICATE_REVIEW_REQUIRED");
        var rep=representatives(user,property).get(unit.getId());
        payment.confirm(unit.getId(),rep==null?null:rep.id(),reason==null?null:security.protect(reason).encrypted(),user,now());
        payment.assignCashBuilding(unit.getBuildingId());
        payments.flush();audit(payment,"CONFIRMED",reason,user);
        cumulative.settle(property,user);
        return ledger(user,property);
    }
    private String separate(String reason) { return reason==null||reason.isBlank()?null:reason.strip(); }
    /** 관리자가 분류한 은행 입금은 세대 수납·선입금·청구 충당과 분리하고 재시도 시 항목과 메모까지 일치해야 합니다. */
    @Transactional
    public PaymentResponse.Ledger confirmOtherIncome(UUID user,UUID property,UUID id,PaymentRequests.OtherIncome request) {
        lock(user,property);
        var payment=requirePayment(property,id);
        requireAfterCutoff(property,payment.getPaymentDate());
        String category=separate(request.category()),note=separate(request.note());
        if(category==null||category.length()>100||(note!=null&&note.length()>500)) throw new PaymentException("INVALID_INCOME_CATEGORY");
        if("CONFIRMED".equals(payment.getStatus())) {
            if(!"OTHER".equals(payment.getReceiptType())||!Objects.equals(category,security.decrypt(payment.getIncomeCategoryEncrypted()))
                ||!Objects.equals(note,security.decrypt(payment.getIncomeNoteEncrypted()))) throw new PaymentException("PAYMENT_REQUEST_CONFLICT");
            return ledger(user,property);
        }
        if(!duplicates(property,payment).isEmpty()) throw new PaymentException("PAYMENT_DUPLICATE_REVIEW_REQUIRED");
        payment.confirmOther(security.protect(category).encrypted(),note==null?null:security.protect(note).encrypted(),user,now());
        payments.flush();audit(payment,"OTHER_INCOME_CONFIRMED",category,user);
        return ledger(user,property);
    }
    private BigDecimal amount(String value,boolean positive) {
        if (value==null||!value.matches("[0-9]{1,15}")) throw new PaymentException("INVALID_AMOUNT");
        var amount=new BigDecimal(value);
        if (positive&&amount.signum()<=0) throw new PaymentException("INVALID_AMOUNT");
        return amount;
    }
    /** 수동 수납 후보는 계좌·날짜·금액과 대표 이름을 함께 대조하고 최종 연결은 명시적으로 선택합니다. */
    private List<Payment> duplicates(UUID property,Payment bank) {
        if (!"BANK_IMPORT".equals(bank.getSourceType())) return List.of();
        return payments.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(property).stream().filter(p->p.getDeletedAt()==null&&"MANUAL".equals(p.getSourceType())
            &&"CONFIRMED".equals(p.getStatus())&&p.getBankTransactionId()==null&&p.getBankAccountId().equals(bank.getBankAccountId())
            &&p.getPaymentDate().equals(bank.getPaymentDate())&&p.getAmount().compareTo(bank.getAmount())==0
            &&p.getPayerNameHmac().equals(bank.getPayerNameHmac())).toList();
    }
    @Transactional
    public PaymentResponse.Ledger hold(UUID user,UUID property,UUID id,String reason) {
        lock(user,property); var p=requirePayment(property,id);
        if ("ON_HOLD".equals(p.getStatus())&&Objects.equals(security.decrypt(p.getHoldReasonEncrypted()),reason.strip())) return ledger(user,property);
        p.hold(security.protect(reason.strip()).encrypted(),now()); payments.flush();audit(p,"ON_HOLD",reason,user);return ledger(user,property);
    }
    @Transactional
    public PaymentResponse.Ledger resume(UUID user,UUID property,UUID id) {
        lock(user,property); var p=requirePayment(property,id);
        if ("PENDING".equals(p.getStatus())) return ledger(user,property);
        p.resume(now());payments.flush();audit(p,"RESUMED",null,user);return ledger(user,property);
    }
    /** 연결 초안을 먼저 제외한 뒤 기존 수납에 원본을 붙여 활성 원본 유일성과 수납 합계를 보존합니다. */
    @Transactional
    public PaymentResponse.Ledger link(UUID user,UUID property,UUID bankId,UUID manualId) {
        lock(user,property); var bank=requirePayment(property,bankId); var manual=requirePayment(property,manualId);
        if ("LINKED".equals(bank.getStatus())&&manualId.equals(bank.getLinkedPaymentId())) return ledger(user,property);
        bank.linkTo(manual,now());payments.flush();manual.attachBankFrom(bank,now());payments.flush();
        audit(manual,"BANK_LINKED",bankId.toString(),user);return ledger(user,property);
    }
    /** 전체 취소는 배분도 함께 취소하고 은행 원본은 재검토 초안으로 복귀시키며 최초 이력을 보존합니다. */
    @Transactional
    public PaymentResponse.Ledger cancel(UUID user,UUID property,UUID id,String reason) {
        lock(user,property);var p=requirePayment(property,id);
        if ("CANCELED".equals(p.getStatus())) return ledger(user,property);
        var at=now();p.cancel(security.protect(reason.strip()).encrypted(),user,at);
        allocations.findByPropertyId(property).stream().filter(a->a.getPaymentId().equals(id)).forEach(a->a.cancel(user,at));
        allocations.flush();payments.flush();
        if (p.getBankTransactionId()!=null) {
            var aliases=payments.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(property).stream()
                .filter(a->id.equals(a.getLinkedPaymentId())&&"LINKED".equals(a.getStatus())).toList();
            if (!aliases.isEmpty()) aliases.forEach(a->a.unlink(at));
            else {
                var replacement=Payment.pending(UUID.randomUUID(),property,p.getBankAccountId(),p.getBankTransactionId(),p.getMatchedUnitId(),p.getPayerResidentId(),
                    p.getPaymentDate(),p.getAmount(),"BANK_IMPORT",p.getPayerNameEncrypted(),p.getPayerNameHmac(),p.getMemoEncrypted(),user,at);
                payments.save(replacement);
            }
        }
        payments.flush();audit(p,"OTHER".equals(p.getReceiptType())?"OTHER_INCOME_CANCELED":"CANCELED",reason,user);
        if("HOUSEHOLD".equals(p.getReceiptType())) cumulative.settle(property,user);
        return ledger(user,property);
    }
    /** 초안과 이미 취소한 미연결 수동 수납을 소프트 삭제하고 확정 수납·은행 취소 이력은 보호합니다. */
    @Transactional
    public PaymentResponse.Ledger delete(UUID user,UUID property,UUID id) {
        lock(user,property);
        var payment=payments.findById(id).filter(p->p.getPropertyId().equals(property)).orElseThrow(()->new PaymentException("PAYMENT_NOT_FOUND"));
        requireDeletable(payment);deleteDraft(user,property,payment);
        transactions.flush();payments.flush();
        return ledger(user,property);
    }
    /** 선택 삭제는 모든 대상의 소속과 납부 상태를 먼저 검증하고 한 트랜잭션에서 처리해 부분 삭제를 막습니다. */
    @Transactional
    public PaymentResponse.Ledger deleteMany(UUID user,UUID property,PaymentRequests.DeleteMany request) {
        lock(user,property);
        var ids=new LinkedHashSet<>(request.paymentIds());var selected=payments.findAllById(ids);
        if(selected.size()!=ids.size()||selected.stream().anyMatch(p->!property.equals(p.getPropertyId()))) throw new PaymentException("PAYMENT_NOT_FOUND");
        selected.forEach(this::requireDeletable);
        selected.forEach(payment->deleteDraft(user,property,payment));
        transactions.flush();payments.flush();
        return ledger(user,property);
    }
    /** 잘못 가져온 통장 거래를 제거할 때 연결 수납·충당을 함께 취소하고 삭제 이력을 보존합니다. */
    @Transactional
    public void removeBankReceipts(UUID user,UUID property,Set<UUID> transactionIds) {
        lock(user,property);
        var selected=payments.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(property).stream()
            .filter(p->p.getDeletedAt()==null&&transactionIds.contains(p.getBankTransactionId())).toList();
        removeReceipts(user,property,selected);
    }
    /** 수동 입금도 통장 거래에서 선택 삭제할 수 있으며 확정 수납·충당 취소와 삭제를 원자적으로 처리합니다. */
    @Transactional
    public void removeManualReceipts(UUID user,UUID property,Set<UUID> paymentIds) {
        lock(user,property);
        var selected=payments.findAllById(paymentIds);
        if(selected.size()!=paymentIds.size()||selected.stream().anyMatch(p->!property.equals(p.getPropertyId())))
            throw new PaymentException("PAYMENT_NOT_FOUND");
        if(selected.stream().anyMatch(p->!"MANUAL".equals(p.getSourceType())||p.getBankTransactionId()!=null))
            throw new PaymentException("PAYMENT_DELETE_NOT_ALLOWED");
        removeReceipts(user,property,selected.stream().filter(p->p.getDeletedAt()==null).toList());
    }
    /** 원본과 감사는 보존하고 유효 수납·충당만 제외합니다. 재시도는 이미 삭제된 수납을 다시 취소하지 않습니다. */
    private void removeReceipts(UUID user,UUID property,List<Payment> selected) {
        if(selected.isEmpty()) return;
        var at=now();var reason=security.protect("통장 거래 선택 삭제").encrypted();
        var ids=selected.stream().map(Payment::getId).collect(Collectors.toSet());
        for(var p:selected) {
            if("CONFIRMED".equals(p.getStatus())) {
                p.cancel(reason,user,at);
                audit(p,"OTHER".equals(p.getReceiptType())?"OTHER_INCOME_CANCELED":"CANCELED","통장 거래 선택 삭제",user);
            }
            p.softDelete(user,at);audit(p,"DELETED","통장 거래 선택 삭제",user);
        }
        // 한 거래라도 실패하면 전체 요청이 롤백됩니다. 취소된 충당은 누적 수납에서 다시 계산합니다.
        allocations.findByPropertyId(property).stream().filter(a->ids.contains(a.getPaymentId())).forEach(a->a.cancel(user,at));
        allocations.flush();payments.flush();cumulative.settle(property,user);
    }
    private void requireDeletable(Payment payment) {
        // 취소된 수동 수납은 이미 충당에서 제외됐으므로 취소 사유·감사를 그대로 보관하면서 목록에서 숨길 수 있습니다.
        boolean canceledManual="CANCELED".equals(payment.getStatus())&&"MANUAL".equals(payment.getSourceType())&&payment.getBankTransactionId()==null;
        if(payment.getDeletedAt()==null&&!Set.of("PENDING","ON_HOLD").contains(payment.getStatus())&&!canceledManual)
            throw new PaymentException("PAYMENT_DELETE_NOT_ALLOWED");
    }
    /** 삭제 표시는 감사 이력을 유지하되 중복 검사에서 제외해 같은 파일의 재등록을 허용합니다. */
    private void deleteDraft(UUID user,UUID property,Payment payment) {
        if(payment.getDeletedAt()!=null) return;
        var at=now();payment.softDelete(user,at);
        if(payment.getBankTransactionId()!=null) {
            var original=transactions.findById(payment.getBankTransactionId()).filter(t->t.getPropertyId().equals(property)).orElseThrow(()->new PaymentException("PAYMENT_NOT_FOUND"));
            original.softDelete(user,at);
        }
        audit(payment,"DELETED",null,user);
    }
    private void audit(Payment p,String action,String reason,UUID user) {
        events.save(PaymentEvent.record(p,action,separate(reason)==null?null:security.protect(reason.strip()).encrypted(),user,now()));
    }
    /** 거래번호가 있으면 계좌별 거래번호, 없으면 확정 정책인 날짜·입금자·금액으로 자동 중복 제외합니다. */
    private String key(BankTransactionReader.Row row) {
        return com.moahome.server.banking.service.BankTransactionKeys.key(row,security);
    }
    /** 파일 미리보기의 선택 ID는 저장 ID와 구분하며 중복 판정에 쓰는 거래 키로 재검증 가능합니다. */
    private UUID previewId(String transactionKey) {
        return UUID.nameUUIDFromBytes(transactionKey.getBytes(StandardCharsets.UTF_8));
    }
    /** 미리보기는 같은 서버 파서를 사용하지만 은행 원본·수납을 저장하지 않습니다. */
    public PaymentResponse.ImportPreview preview(UUID user,UUID property,MultipartFile file) {
        requireAdmin(user,property);var account=primary(property);
        var existing=transactions.findByPropertyId(property).stream().filter(t->t.getDeletedAt()==null&&t.getBankAccountId().equals(account.getId()))
            .map(BankTransaction::getDeduplicationKey).collect(Collectors.toSet());
        var unitRows=ledger(user,property).units();var residentRows=residents.list(user,property).residents();
        var rows=reader.read(file);List<PaymentResponse.Payment> result=new ArrayList<>();int duplicated=0;
        for (var row:rows) {
            if(!afterCutoff(property,row.date())) { duplicated++;continue; }
            if (row.date().isAfter(today())) throw new PaymentException("INVALID_PAYMENT_DATE");
            String key=key(row);if (!existing.add(key)) { duplicated++;continue; }
            UUID candidate=unitCandidate(row.payer(),unitRows,residentRows);
            result.add(new PaymentResponse.Payment(previewId(key),"BANK_IMPORT","PENDING",account.getId(),row.date(),
                row.payer(),row.amount().toPlainString(),candidate==null?"":candidate.toString(),candidate==null?"":candidateReason(row.payer(),unitRows),
                List.of(),null,null,null,null,null,row.memo(),"HOUSEHOLD",null,null));
        }
        return new PaymentResponse.ImportPreview(property,result,duplicated);
    }
    /** 확정 버튼에서 파일을 다시 검증하고 잠금 아래 중복을 재검사해 원본·초안을 한 번만 함께 저장합니다. */
    @Transactional
    public PaymentResponse.Ledger importFile(UUID user,UUID property,MultipartFile file) {
        return importFile(user,property,file,null);
    }
    /** 선택은 원본 파일의 거래 키로 검증하고 선택한 입금만 저장·자동 확정합니다. 재업로드에도 같은 중복 정책을 적용합니다. */
    @Transactional
    public PaymentResponse.Ledger importFile(UUID user,UUID property,MultipartFile file,PaymentRequests.BankImportSelection selection) {
        lock(user,property);var account=primary(property);var at=now();
        var rows=reader.read(file);
        if(rows.stream().anyMatch(row->row.date().isAfter(today()))) throw new PaymentException("INVALID_PAYMENT_DATE");
        Set<UUID> selected=null;
        if(selection!=null) {
            var ids=selection.transactionIds();
            if(ids==null||ids.isEmpty()||ids.size()>5000||ids.stream().anyMatch(Objects::isNull)) throw new PaymentException("INVALID_BANK_SELECTION");
            selected=new HashSet<>(ids);
            var allowed=rows.stream().map(row->previewId(key(row))).collect(Collectors.toSet());
            if(!allowed.containsAll(selected)) throw new PaymentException("INVALID_BANK_SELECTION");
        }
        final Set<UUID> wanted=selected;
        return importBankRows(user,property,rows.stream().filter(row->wanted==null||wanted.contains(previewId(key(row)))).toList(),Map.of());
    }
    public record BankReceiptChoice(UUID unitId,String category,String note) {}
    /** 통장 수집도 기존 원본·초안·자동 수납 흐름을 사용합니다. 명시한 용도는 자동 확정보다 먼저 적용합니다. */
    @Transactional
    public PaymentResponse.Ledger importBankRows(UUID user,UUID property,List<BankTransactionReader.Row> rows,Map<UUID,BankReceiptChoice> choices) {
        lock(user,property);var account=primary(property);var at=now();
        var snapshot=ledger(user,property);var residentRows=residents.list(user,property).residents();
        for(var row:rows) {
            if(!"INCOME".equals(row.direction())||row.date().isAfter(today())) throw new PaymentException("INVALID_BANK_ROW");
            var key=key(row);
            if(!afterCutoff(property,row.date())) continue;
            if(transactions.findByBankAccountIdAndDeduplicationKeyAndDeletedAtIsNull(account.getId(),key).isPresent()) continue;
            var name=security.protect(row.payer());String hmac=security.nameHash(row.payer());
            var t=transactions.saveAndFlush(BankTransaction.create(property,account.getId(),row.date(),row.amount(),name.encrypted(),hmac,
                row.memo()==null?null:security.protect(row.memo()).encrypted(),row.reference(),key,user,at,row.time(),row.balance()));
            var p=Payment.pending(UUID.randomUUID(),property,account.getId(),t.getId(),null,null,row.date(),row.amount(),"BANK_IMPORT",
                t.getPayerNameEncrypted(),hmac,t.getMemoEncrypted(),user,at);
            payments.saveAndFlush(p);audit(p,"IMPORTED",null,user);
            var choice=choices.get(previewId(key));
            if(choice!=null&&choice.category()!=null) confirmOtherIncome(user,property,p.getId(),new PaymentRequests.OtherIncome(choice.category(),choice.note()));
            else if(choice!=null&&choice.unitId()!=null) confirmCumulative(user,property,p,new PaymentRequests.Confirm(choice.unitId(),null,null));
            else confirmMatched(user,property,p,snapshot.units(),residentRows);
        }
        payments.flush();cumulative.settle(property,user);
        return ledger(user,property);
    }

    /** 인계일 이전 입금은 이미 기존 잔액에 포함되므로 수동 입력·재확정에서도 신규 수납으로 반영하지 않습니다. */
    private boolean afterCutoff(UUID property, LocalDate date) {
        var target=properties.findById(property).orElseThrow();
        return target.getBalanceCutoffDate()==null || date.isAfter(target.getBalanceCutoffDate());
    }
    private void requireAfterCutoff(UUID property, LocalDate date) {
        if(!afterCutoff(property,date)) throw new PaymentException("PAYMENT_BEFORE_OPENING_CUTOFF");
    }
}
