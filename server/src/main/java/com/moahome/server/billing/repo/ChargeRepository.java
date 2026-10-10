package com.moahome.server.billing.repo;
import java.util.*;
import com.moahome.server.billing.domain.Charge;
import org.springframework.data.jpa.repository.JpaRepository;
public interface ChargeRepository extends JpaRepository<Charge, UUID> {
    List<Charge> findByBillingPeriodId(UUID periodId);
    List<Charge> findByPropertyId(UUID propertyId);
}
