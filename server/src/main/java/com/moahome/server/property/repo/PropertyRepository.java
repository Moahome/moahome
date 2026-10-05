package com.moahome.server.property.repo;

import java.util.UUID;
import com.moahome.server.property.domain.Property;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PropertyRepository extends JpaRepository<Property, UUID> {
}
