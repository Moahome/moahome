package com.moahome.server.accounting.repo;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.moahome.server.accounting.domain.AccountingAccount;

public interface AccountingAccountRepository extends JpaRepository<AccountingAccount, UUID> {
	List<AccountingAccount> findByPropertyIdOrderByCreatedAtAscIdAsc(UUID propertyId);
}
