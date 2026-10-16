package com.moahome.server.payment.repo;
import java.util.*;
import com.moahome.server.payment.domain.PaymentAllocation;
import org.springframework.data.jpa.repository.JpaRepository;
public interface PaymentAllocationRepository extends JpaRepository<PaymentAllocation,UUID> {
    List<PaymentAllocation> findByPropertyId(UUID propertyId);
}
