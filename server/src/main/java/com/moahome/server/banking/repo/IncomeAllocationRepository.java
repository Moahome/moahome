package com.moahome.server.banking.repo;
import java.util.*;
import com.moahome.server.banking.domain.IncomeAllocation;
import org.springframework.data.jpa.repository.JpaRepository;
public interface IncomeAllocationRepository extends JpaRepository<IncomeAllocation,UUID> {
    List<IncomeAllocation> findByPropertyIdOrderBySortOrderAsc(UUID propertyId);
    List<IncomeAllocation> findByPaymentIdOrderBySortOrderAsc(UUID paymentId);
}
