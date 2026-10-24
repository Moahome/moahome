package com.moahome.server.membership.repo;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
import com.moahome.server.membership.domain.ResidentJoinCode;

public interface ResidentJoinCodeRepository extends JpaRepository<ResidentJoinCode, UUID> {
	Optional<ResidentJoinCode> findByCodeHash(String hash);

	List<ResidentJoinCode> findByPropertyIdAndStatus(UUID property, String status);
}
