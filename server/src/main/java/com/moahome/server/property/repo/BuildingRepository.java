package com.moahome.server.property.repo;

import java.util.UUID;
import com.moahome.server.property.domain.Building;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BuildingRepository extends JpaRepository<Building, UUID> {
}
