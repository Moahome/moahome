package com.moahome.server.membership.repo;

import java.util.UUID;
import java.util.List;
import com.moahome.server.membership.domain.PropertyMember;
import com.moahome.server.membership.domain.PropertyMemberRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PropertyMemberRepository extends JpaRepository<PropertyMember, UUID> {
	List<PropertyMember> findByPropertyIdAndDeletedAtIsNull(UUID propertyId);
	java.util.List<PropertyMember> findByPropertyIdAndUserIdAndDeletedAtIsNull(UUID propertyId, UUID userId);
	String MANAGEMENT_QUERY = """
		select p.id as propertyId, p.name as name, m.role as role
		from PropertyMember m, Property p
		where m.propertyId = p.id and m.userId = :userId
		and m.role in (com.moahome.server.membership.domain.PropertyMemberRole.ADMIN,
			com.moahome.server.membership.domain.PropertyMemberRole.MANAGER)
		and m.status = com.moahome.server.membership.domain.PropertyMemberStatus.ACTIVE
		and m.endedAt is null and m.deletedAt is null
		and p.status = com.moahome.server.property.domain.PropertyStatus.ACTIVE and p.deletedAt is null
		""";

	/** 등록 제출 여부와 무관하게 현재 관리자 참여를 읽고 기본 진입 순서를 고정합니다. */
	@Query(MANAGEMENT_QUERY + " order by p.createdAt, p.id")
	List<ManagementProperty> findManagedProperties(UUID userId);

	/** 직접 주소 접근도 인증 계정·대상·현재 관리자 조건을 하나의 조회에 적용합니다. */
	@Query(MANAGEMENT_QUERY + " and p.id = :propertyId")
	List<ManagementProperty> findManagementContext(UUID userId, UUID propertyId);

	interface ManagementProperty {
		UUID getPropertyId();
		String getName();
		PropertyMemberRole getRole();
	}

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
