package com.moahome.server.billing.repo;

import java.util.*;
import com.moahome.server.billing.domain.BillingAddition;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BillingAdditionRepository extends JpaRepository<BillingAddition, UUID> {
	Optional<BillingAddition> findByPropertyIdAndRequestId(UUID propertyId, UUID requestId);

	List<BillingAddition> findByBillingPeriodIdOrderByCreatedAtAscIdAsc(UUID periodId);
}
