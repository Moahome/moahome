package com.moahome.server.banking.repo;

import java.util.UUID;
import com.moahome.server.banking.domain.BankAccount;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BankAccountRepository extends JpaRepository<BankAccount, UUID> {
    /** 모든 통장 조회에서 저장된 최초 등록 순서를 공통으로 사용합니다. */
    @org.springframework.data.jpa.repository.Query("select a from BankAccount a where a.propertyId = :propertyId and a.deletedAt is null order by a.registrationOrder, a.createdAt, a.id")
    java.util.List<BankAccount> findByPropertyIdAndDeletedAtIsNull(UUID propertyId);

    /** 관리대상 잠금 아래 삭제·종료된 통장의 번호도 재사용하지 않고 다음 등록 순서를 배정합니다. */
    @org.springframework.data.jpa.repository.Query("select coalesce(max(a.registrationOrder), -1) + 1 from BankAccount a where a.propertyId = :propertyId")
    int nextRegistrationOrder(UUID propertyId);
}
