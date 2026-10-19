package com.moahome.server.banking.repo;

import java.util.*;
import com.moahome.server.banking.domain.BuildingCashOpening;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BuildingCashOpeningRepository extends JpaRepository<BuildingCashOpening, UUID> {
	List<BuildingCashOpening> findByPropertyId(UUID propertyId);
}
