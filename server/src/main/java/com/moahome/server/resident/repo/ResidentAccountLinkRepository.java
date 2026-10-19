package com.moahome.server.resident.repo;

import java.util.UUID;
import com.moahome.server.resident.domain.ResidentAccountLink;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ResidentAccountLinkRepository extends JpaRepository<ResidentAccountLink, UUID> {
	boolean existsByPropertyIdAndResidentIdAndUserIdAndUnitResidentId(UUID propertyId, UUID residentId, UUID userId,
	    UUID unitResidentId);
}
