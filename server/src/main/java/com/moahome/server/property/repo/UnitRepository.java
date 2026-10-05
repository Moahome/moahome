package com.moahome.server.property.repo;

import java.util.UUID;
import com.moahome.server.property.domain.Unit;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UnitRepository extends JpaRepository<Unit, UUID> {
}
