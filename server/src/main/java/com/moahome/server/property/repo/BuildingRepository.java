package com.moahome.server.property.repo;

import java.util.UUID;
import java.util.List;
import java.util.Optional;
import com.moahome.server.property.domain.Building;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BuildingRepository extends JpaRepository<Building, UUID> {
	List<Building> findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(UUID propertyId);
	Optional<Building> findByIdAndPropertyId(UUID id, UUID propertyId);
	Optional<Building> findByIdAndPropertyIdAndDeletedAtIsNull(UUID id, UUID propertyId);
	boolean existsByPropertyIdAndNameAndDeletedAtIsNullAndIdNot(UUID propertyId, String name, UUID id);
}
