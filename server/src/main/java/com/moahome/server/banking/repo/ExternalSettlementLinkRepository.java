package com.moahome.server.banking.repo;

import java.util.*;
import com.moahome.server.banking.domain.ExternalSettlementLink;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExternalSettlementLinkRepository extends JpaRepository<ExternalSettlementLink, UUID> {
	List<ExternalSettlementLink> findByPropertyId(UUID propertyId);
}
