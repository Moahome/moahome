package com.moahome.server.expense.repo;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.moahome.server.expense.domain.PayableSettlement;

public interface PayableSettlementRepository extends JpaRepository<PayableSettlement, UUID> {
	List<PayableSettlement> findByPropertyId(UUID propertyId);
}
