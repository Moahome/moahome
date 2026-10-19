package com.moahome.server.resident.repo;

import java.util.Optional;
import java.util.UUID;
import com.moahome.server.resident.domain.UnitResident;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UnitResidentRepository extends JpaRepository<UnitResident, UUID> {
	java.util.List<UnitResident> findByPropertyIdAndUnitIdInAndStatusAndDeletedAtIsNull(UUID propertyId,
	    java.util.Collection<UUID> unitIds, String status);

	// 최초 등록 여부는 과거·삭제 관계까지 포함하며 대표 부재를 자동 재지정으로 해석하지 않습니다.
	boolean existsByPropertyIdAndUnitId(UUID propertyId, UUID unitId);

	Optional<UnitResident> findByPropertyIdAndResidentIdAndStatusAndDeletedAtIsNull(UUID propertyId, UUID residentId,
	    String status);

	Optional<UnitResident> findFirstByPropertyIdAndResidentIdOrderByUpdatedAtDescIdDesc(UUID propertyId,
	    UUID residentId);

	/** 대표 후보는 같은 세대의 현재 관계와 삭제되지 않은 실제 명부로 한정합니다. */
	@org.springframework.data.jpa.repository.Query("""
		select ur from UnitResident ur, Resident r
		where ur.propertyId = :propertyId and ur.unitId = :unitId
		and ur.status = 'ACTIVE' and ur.deletedAt is null
		and r.id = ur.residentId and r.propertyId = ur.propertyId and r.deletedAt is null
		order by r.name, r.id
		""")
	java.util.List<UnitResident> findCurrentUnitResidents(UUID propertyId, UUID unitId);
}
