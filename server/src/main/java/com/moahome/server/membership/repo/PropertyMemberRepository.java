package com.moahome.server.membership.repo;

import java.util.UUID;
import com.moahome.server.membership.domain.PropertyMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PropertyMemberRepository extends JpaRepository<PropertyMember, UUID> {
	/** 저장 당시의 스냅샷 대신 현재 참여·관리대상 상태로 결과 접근권한을 확인합니다. */
	@Query("""
		select count(m) > 0 from PropertyMember m, Property p
		where m.propertyId = p.id and m.userId = :userId and p.id = :propertyId
		and m.status = com.moahome.server.membership.domain.PropertyMemberStatus.ACTIVE
		and m.endedAt is null and m.deletedAt is null and p.deletedAt is null
		and p.status = com.moahome.server.property.domain.PropertyStatus.ACTIVE
		""")
	boolean hasCurrentAccess(UUID userId, UUID propertyId);
}
