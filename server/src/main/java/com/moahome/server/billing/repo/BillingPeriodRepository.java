package com.moahome.server.billing.repo;

import java.util.*;
import com.moahome.server.billing.domain.BillingPeriod;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BillingPeriodRepository extends JpaRepository<BillingPeriod, UUID> {
	Optional<BillingPeriod> findByPropertyIdAndBillingYearAndBillingMonth(UUID propertyId, short year, short month);

	List<BillingPeriod> findByPropertyIdOrderByBillingYearDescBillingMonthDesc(UUID propertyId);
}
