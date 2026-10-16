package com.moahome.server.banking.repo;
import java.util.*;
import com.moahome.server.banking.domain.BankTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
public interface BankTransactionRepository extends JpaRepository<BankTransaction,UUID> {
    List<BankTransaction> findByPropertyId(UUID propertyId); Optional<BankTransaction> findByBankAccountIdAndDeduplicationKeyAndDeletedAtIsNull(UUID account, String key);
}
