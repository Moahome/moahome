package com.moahome.server.billing.repo;

import java.util.*;
import com.moahome.server.billing.domain.OpeningBalanceBatch;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OpeningBalanceBatchRepository extends JpaRepository<OpeningBalanceBatch, UUID> {
	List<OpeningBalanceBatch> findByPropertyIdOrderByCreatedAtDesc(UUID property);
}
