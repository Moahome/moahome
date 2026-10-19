package com.moahome.server.billing.repo;

import java.util.*;
import com.moahome.server.billing.domain.Charge;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChargeRepository extends JpaRepository<Charge, UUID> {
	List<Charge> findByBillingPeriodId(UUID periodId);

	List<Charge> findByPropertyId(UUID propertyId);

	/** 수납 배분이 살아 있는 청구를 공실·삭제로 제외해 수납이 사라지는 변경을 방지합니다. */
	@org.springframework.data.jpa.repository.Query("select (exists(select a.id from PaymentAllocation a where a.chargeId in :ids and a.status='ACTIVE') or exists(select c.id from CreditApplication c where c.chargeId in :ids and c.status='ACTIVE'))")
	boolean hasActiveAllocations(java.util.Collection<UUID> ids);
}
