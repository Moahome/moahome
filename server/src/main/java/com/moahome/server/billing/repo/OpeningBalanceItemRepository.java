package com.moahome.server.billing.repo;

import java.util.*;
import com.moahome.server.billing.domain.OpeningBalanceItem;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OpeningBalanceItemRepository extends JpaRepository<OpeningBalanceItem, UUID> {
	List<OpeningBalanceItem> findByBatchId(UUID batch);

	List<OpeningBalanceItem> findByPropertyId(UUID property);

	void deleteByBatchId(UUID batch);
}
