package com.moahome.server.banking.repo;

import java.util.UUID;
import com.moahome.server.banking.domain.BankAccount;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BankAccountRepository extends JpaRepository<BankAccount, UUID> {
    java.util.List<BankAccount> findByPropertyIdAndDeletedAtIsNull(UUID propertyId);
}
