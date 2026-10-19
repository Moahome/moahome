package com.moahome.server.resident.repo;

import java.util.UUID;
import com.moahome.server.resident.domain.ResidentRegistrationResult;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ResidentRegistrationResultRepository extends JpaRepository<ResidentRegistrationResult, UUID> {
}
