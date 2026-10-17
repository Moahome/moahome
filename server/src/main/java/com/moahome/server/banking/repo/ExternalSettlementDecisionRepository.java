package com.moahome.server.banking.repo;

import java.util.*;
import com.moahome.server.banking.domain.ExternalSettlementDecision;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExternalSettlementDecisionRepository extends JpaRepository<ExternalSettlementDecision,UUID> {
    List<ExternalSettlementDecision> findByPropertyIdOrderByRevisionAsc(UUID propertyId);
    Optional<ExternalSettlementDecision> findFirstByPropertyIdAndAllocationIdOrderByRevisionDesc(UUID propertyId,UUID allocationId);
}
