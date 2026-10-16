package com.moahome.server.banking.domain;
import java.math.BigDecimal;
import java.time.*;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.Getter;
@Getter @Entity @Table(name="bank_transactions")
public class BankTransaction {
    @Id private UUID id;
    @Column(name="property_id",nullable=false) private UUID propertyId;
    @Column(name="bank_account_id",nullable=false) private UUID bankAccountId;
    @Column(name="transaction_date",nullable=false) private LocalDate transactionDate;
    @Column(name="transaction_time") private LocalTime transactionTime;
    @Column(precision=15,scale=0) private BigDecimal balance;
    @Column(nullable=false,precision=15,scale=0) private BigDecimal amount;
    @Column(name="payer_name_encrypted",nullable=false,columnDefinition="text") private String payerNameEncrypted;
    @Column(name="payer_name_hmac",nullable=false,columnDefinition="char(64)")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.CHAR) private String payerNameHmac;
    @Column(name="memo_encrypted",columnDefinition="text") private String memoEncrypted;
    @Column(name="bank_reference",length=200) private String bankReference;
    @Column(name="deduplication_key",nullable=false,columnDefinition="char(64)")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.CHAR) private String deduplicationKey;
    @Column(name="imported_by",nullable=false) private UUID importedBy;
    @Column(name="imported_at",nullable=false,columnDefinition="timestamptz") private OffsetDateTime importedAt;
    protected BankTransaction() {}
    /** 업로드 원본은 확정·취소로 덮어쓰지 않고 중복 키와 보호된 입금 정보를 보존합니다. */
    public static BankTransaction create(UUID property, UUID account, LocalDate date, BigDecimal amount, String encrypted,
        String hash, String memo, String reference, String key, UUID actor, OffsetDateTime at, LocalTime time, BigDecimal balance) {
        var t=new BankTransaction(); t.id=UUID.randomUUID(); t.propertyId=property; t.bankAccountId=account;
        t.transactionDate=date; t.transactionTime=time; t.balance=balance; t.amount=amount; t.payerNameEncrypted=encrypted; t.payerNameHmac=hash;
        t.memoEncrypted=memo; t.bankReference=reference; t.deduplicationKey=key; t.importedBy=actor; t.importedAt=at; return t;
    }
}
