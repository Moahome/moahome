package com.moahome.server.property.repo;

import java.util.UUID;
import java.util.List;
import java.util.Optional;
import com.moahome.server.property.domain.Unit;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UnitRepository extends JpaRepository<Unit, UUID> {
	List<Unit> findByPropertyId(UUID propertyId);

	List<Unit> findByPropertyIdAndIdIn(UUID propertyId, java.util.Collection<UUID> ids);

	List<Unit> findByPropertyIdAndBuildingIdAndDeletedAtIsNull(UUID propertyId, UUID buildingId);

	List<Unit> findByPropertyIdAndDeletedAtIsNull(UUID propertyId);

	Optional<Unit> findByIdAndPropertyIdAndDeletedAtIsNull(UUID id, UUID propertyId);

	boolean existsByPropertyIdAndBuildingIdAndUnitNumberAndDeletedAtIsNullAndIdNot(UUID propertyId, UUID buildingId,
	    String unitNumber, UUID id);
}
