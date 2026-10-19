package com.moahome.server.banking.repo;

import java.util.*;
import com.moahome.server.banking.domain.BuildingCashOpeningChange;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BuildingCashOpeningChangeRepository extends JpaRepository<BuildingCashOpeningChange, UUID> {
	List<BuildingCashOpeningChange> findByRequestId(UUID requestId);
}
