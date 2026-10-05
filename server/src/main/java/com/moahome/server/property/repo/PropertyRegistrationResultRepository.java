package com.moahome.server.property.repo;

import com.moahome.server.property.domain.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PropertyRegistrationResultRepository
	extends JpaRepository<PropertyRegistrationResult, PropertyRegistrationId> {
}
