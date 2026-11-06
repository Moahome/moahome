package com.moahome.server.banking.repo;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.moahome.server.banking.domain.BankTransferAllocation;

public interface BankTransferAllocationRepository extends JpaRepository<BankTransferAllocation, UUID> {
	List<BankTransferAllocation> findByPropertyId(UUID propertyId);
}
