package com.moahome.server.banking.repo;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.moahome.server.banking.domain.BankTransferPosting;

public interface BankTransferPostingRepository extends JpaRepository<BankTransferPosting, UUID> {
	List<BankTransferPosting> findByPropertyId(UUID propertyId);
}
