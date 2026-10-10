package com.moahome.server.resident.repo;

import java.util.Optional;
import java.util.UUID;
import com.moahome.server.resident.domain.UnitResident;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UnitResidentRepository extends JpaRepository<UnitResident, UUID> {
	// 최초 등록 여부는 과거·삭제 관계까지 포함하며 대표 부재를 자동 재지정으로 해석하지 않습니다.
	boolean existsByPropertyIdAndUnitId(UUID propertyId, UUID unitId);
	Optional<UnitResident> findByPropertyIdAndResidentIdAndStatusAndDeletedAtIsNull(UUID propertyId, UUID residentId, String status);
}
