package com.moahome.server.payment.domain;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import jakarta.persistence.*;
import lombok.Getter;
import com.moahome.server.payment.exception.PaymentException;

@Getter
@Entity
@Table(name="payments")
public class Payment implements org.springframework.data.domain.Persistable<UUID> {
    @Transient private boolean newRecord;
    @Override public boolean isNew() { return newRecord; }
    @PostLoad @PostPersist private void persisted() { newRecord=false; }
    @Id private UUID id;
    @Column(name="property_id",nullable=false) private UUID propertyId;
    @Column(name="bank_account_id",nullable=false) private UUID bankAccountId;
    @Column(name="bank_transaction_id") private UUID bankTransactionId;
    @Column(name="matched_unit_id") private UUID matchedUnitId;
    @Column(name="payer_resident_id") private UUID payerResidentId;
    @Column(name="payment_date",nullable=false) private LocalDate paymentDate;
    @Column(nullable=false,precision=15,scale=0) private BigDecimal amount;
    @Column(name="source_type",nullable=false,length=20) private String sourceType;
    @Column(name="payer_name_encrypted",nullable=false,columnDefinition="text") private String payerNameEncrypted;
    @Column(name="payer_name_hmac",nullable=false,columnDefinition="char(64)")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.CHAR) private String payerNameHmac;
    @Column(name="memo_encrypted",columnDefinition="text") private String memoEncrypted;
    @Column(nullable=false,length=20) private String status;
    @Column(name="receipt_type",nullable=false,length=20) private String receiptType;
    @Column(name="income_category_encrypted",columnDefinition="text") private String incomeCategoryEncrypted;
    @Column(name="income_note_encrypted",columnDefinition="text") private String incomeNoteEncrypted;
    @Column(name="linked_payment_id") private UUID linkedPaymentId;
    @Column(name="hold_reason_encrypted",columnDefinition="text") private String holdReasonEncrypted;
    @Column(name="separate_reason_encrypted",columnDefinition="text") private String separateReasonEncrypted;
    @Column(name="confirmed_by") private UUID confirmedBy;
    @Column(name="confirmed_at",columnDefinition="timestamptz") private OffsetDateTime confirmedAt;
    @Column(name="canceled_by") private UUID canceledBy;
    @Column(name="canceled_at",columnDefinition="timestamptz") private OffsetDateTime canceledAt;
    @Column(name="cancel_reason_encrypted",columnDefinition="text") private String cancelReasonEncrypted;
    @Column(name="created_by",nullable=false) private UUID createdBy;
    @Column(name="created_at",nullable=false,columnDefinition="timestamptz") private OffsetDateTime createdAt;
    @Column(name="updated_at",nullable=false,columnDefinition="timestamptz") private OffsetDateTime updatedAt;
    @Column(name="deleted_at",columnDefinition="timestamptz") private OffsetDateTime deletedAt;
    @Column(name="deleted_by") private UUID deletedBy;
    protected Payment() {}

    /** 수동·은행 경로 모두 초안으로 시작하고 원 금액·이름 스냅샷과 생성자를 보존합니다. */
    public static Payment pending(UUID id, UUID property, UUID account, UUID bank, UUID unit, UUID resident,
        LocalDate date, BigDecimal amount, String source, String encrypted, String hmac, String memo, UUID actor, OffsetDateTime at) {
        if (amount.scale()!=0 || amount.signum()<=0 || amount.precision()>15) throw new PaymentException("INVALID_AMOUNT");
        var p=new Payment(); p.newRecord=true; p.id=id; p.propertyId=property; p.bankAccountId=account;
        p.bankTransactionId=bank; p.matchedUnitId=unit; p.payerResidentId=resident; p.paymentDate=date;
        p.amount=amount; p.sourceType=source; p.payerNameEncrypted=encrypted; p.payerNameHmac=hmac;
        p.memoEncrypted=memo; p.status="PENDING"; p.receiptType="HOUSEHOLD"; p.createdBy=actor; p.createdAt=at; p.updatedAt=at;
        return p;
    }
    /** 동일 확정 재요청은 서비스에서 내용 일치를 확인한 뒤 반환하고 다른 상태 전이는 거부합니다. */
    public void confirm(UUID unit, UUID resident, String separateReason, UUID actor, OffsetDateTime at) {
        require("PENDING"); matchedUnitId=unit; payerResidentId=resident; separateReasonEncrypted=separateReason;
        status="CONFIRMED"; confirmedBy=actor; confirmedAt=at; updatedAt=at;
    }
    /** 기타 입금은 은행 원본을 유지하며 세대·주민 연결 없이 별도 항목과 메모로 확정합니다. */
    public void confirmOther(String category, String note, UUID actor, OffsetDateTime at) {
        require("PENDING");
        if (!"BANK_IMPORT".equals(sourceType)) throw new PaymentException("PAYMENT_STATE_CONFLICT");
        receiptType="OTHER"; matchedUnitId=null; payerResidentId=null;
        incomeCategoryEncrypted=Objects.requireNonNull(category); incomeNoteEncrypted=note;
        status="CONFIRMED"; confirmedBy=actor; confirmedAt=at; updatedAt=at;
    }
    public void hold(String encryptedReason, OffsetDateTime at) {
        require("PENDING");
        if (!"BANK_IMPORT".equals(sourceType)) throw new PaymentException("PAYMENT_STATE_CONFLICT");
        status="ON_HOLD"; holdReasonEncrypted=Objects.requireNonNull(encryptedReason); updatedAt=at;
    }
    public void resume(OffsetDateTime at) { require("ON_HOLD"); status="PENDING"; updatedAt=at; }
    /** 취소는 최초 근거와 확인 이력을 보존하며 재시도로 최초 사유를 덮어쓰지 않습니다. */
    public void cancel(String encryptedReason, UUID actor, OffsetDateTime at) {
        if ("CANCELED".equals(status)) return;
        require("CONFIRMED"); status="CANCELED"; canceledBy=actor; canceledAt=at;
        cancelReasonEncrypted=Objects.requireNonNull(encryptedReason); updatedAt=at;
    }
    /** 연결용 원본 초안은 합계에서 제외하고 기존 수동 수납의 금액·청구 배분을 유지합니다. */
    public void linkTo(Payment manual, OffsetDateTime at) {
        require("PENDING"); manual.require("CONFIRMED");
        if (!"BANK_IMPORT".equals(sourceType) || !"MANUAL".equals(manual.sourceType) || manual.bankTransactionId!=null
            || !propertyId.equals(manual.propertyId) || !bankAccountId.equals(manual.bankAccountId)
            || !paymentDate.equals(manual.paymentDate) || amount.compareTo(manual.amount)!=0
            || !payerNameHmac.equals(manual.payerNameHmac)) throw new PaymentException("PAYMENT_LINK_CONFLICT");
        status="LINKED"; linkedPaymentId=manual.id; updatedAt=at;

    }
    /** 원본 초안의 활성 유일성을 먼저 해제한 뒤 같은 트랜잭션에서 수동 수납에 연결합니다. */
    public void attachBankFrom(Payment bank, OffsetDateTime at) {
        require("CONFIRMED");
        if (!"LINKED".equals(bank.status) || !id.equals(bank.linkedPaymentId)) throw new PaymentException("PAYMENT_LINK_CONFLICT");
        bankTransactionId=bank.bankTransactionId; updatedAt=at;
    }
    /** 연결한 수납 취소 후 같은 은행 원본을 다시 검토하고 기존 연결·취소는 이벤트에 보존합니다. */
    public void unlink(OffsetDateTime at) { require("LINKED"); linkedPaymentId=null; status="PENDING"; updatedAt=at; }
    /** 삭제는 확정 수납의 충당 해제 후 표시하며 원본과 처리 이력의 참조를 보존합니다. */
    public void softDelete(UUID actor,OffsetDateTime at) {
        if(deletedAt!=null) return;
        if("CONFIRMED".equals(status)) throw new PaymentException("PAYMENT_STATE_CONFLICT");
        deletedBy=Objects.requireNonNull(actor);deletedAt=Objects.requireNonNull(at);updatedAt=at;
    }
    private void require(String expected) {
        if(deletedAt!=null) throw new PaymentException("PAYMENT_NOT_FOUND");
        if (!expected.equals(status)) throw new PaymentException("PAYMENT_STATE_CONFLICT");
    }
}
