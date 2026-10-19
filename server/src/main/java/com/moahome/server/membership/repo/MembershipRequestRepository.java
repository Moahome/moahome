package com.moahome.server.membership.repo;

import java.util.List;
import java.util.UUID;
import com.moahome.server.membership.domain.MembershipRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface MembershipRequestRepository extends JpaRepository<MembershipRequest, UUID> {
	List<MembershipRequest> findByPropertyIdOrderByRequestedAtDesc(UUID propertyId);

	List<MembershipRequest> findByPropertyIdAndUserIdAndUnitIdAndStatusAndDeletedAtIsNull(UUID propertyId, UUID userId,
	    UUID unitId, String status);

	List<MembershipRequest> findByPropertyIdAndUnitIdInAndStatusAndDeletedAtIsNull(UUID propertyId,
	    java.util.Collection<UUID> unitIds, String status);

	/** 주민이 확인된 신청과 연결 계정의 승인 기록만 사용하며 연락처·호수만 같은 다른 사람의 신청은 제외합니다. */
	@Query("""
        select request from MembershipRequest request
        where request.propertyId = :propertyId and request.deletedAt is null
        and ((request.matchedResidentId = :residentId and request.matchStatus in ('MATCHED', 'MANUAL'))
            or (:userId is not null and request.userId = :userId and request.status = 'APPROVED'))
        """)
	List<MembershipRequest> findLinked(UUID propertyId, UUID residentId, UUID userId);
}
