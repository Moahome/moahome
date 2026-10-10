package com.moahome.server.billing.repo;

import java.util.UUID;
import com.moahome.server.billing.domain.FeeTemplateItem;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FeeTemplateItemRepository extends JpaRepository<FeeTemplateItem, UUID> {
	java.util.List<FeeTemplateItem> findByFeeTemplateIdAndActiveTrueAndDeletedAtIsNullOrderBySortOrderAsc(UUID templateId);
}
