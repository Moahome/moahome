package com.moahome.server.membership.repo;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
import com.moahome.server.membership.domain.ResidentInvitation;

public interface ResidentInvitationRepository extends JpaRepository<ResidentInvitation, UUID> {
	Optional<ResidentInvitation> findByTokenHash(String tokenHash);

	List<ResidentInvitation> findByPropertyIdOrderByCreatedAtDesc(UUID propertyId);

	List<ResidentInvitation> findByPropertyIdAndResidentIdAndStatusIn(UUID propertyId, UUID residentId,
	    Collection<String> statuses);
}
