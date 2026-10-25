package com.moahome.server.billing.repo;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.moahome.server.billing.domain.FeeTemplateItem;

public interface FeeTemplateItemRepository extends JpaRepository<FeeTemplateItem, UUID> {
	List<FeeTemplateItem> findByFeeTemplateIdAndActiveTrueAndDeletedAtIsNullOrderBySortOrderAsc(
	    UUID templateId);
}
