package com.moahome.server.banking.repo;

import java.util.*;
import com.moahome.server.banking.domain.BankTransfer;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BankTransferRepository extends JpaRepository<BankTransfer, UUID> {
	List<BankTransfer> findByPropertyId(UUID propertyId);
}
