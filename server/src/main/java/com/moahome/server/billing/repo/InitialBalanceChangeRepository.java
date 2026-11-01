package com.moahome.server.billing.repo;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
import com.moahome.server.billing.domain.InitialBalanceChange;

public interface InitialBalanceChangeRepository extends JpaRepository<InitialBalanceChange, UUID> {
	List<InitialBalanceChange> findByPropertyIdOrderByChangedAtDesc(UUID propertyId);
}
