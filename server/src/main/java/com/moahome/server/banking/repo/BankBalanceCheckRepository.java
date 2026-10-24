package com.moahome.server.banking.repo;

import java.util.*;
import com.moahome.server.banking.domain.BankBalanceCheck;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BankBalanceCheckRepository extends JpaRepository<BankBalanceCheck, UUID> {
	List<BankBalanceCheck> findByPropertyIdOrderByCheckedAtDescCreatedAtDesc(UUID propertyId);
}
