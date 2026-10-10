package com.moahome.server.billing.repo;

import java.util.UUID;
import com.moahome.server.billing.domain.FeeTemplate;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FeeTemplateRepository extends JpaRepository<FeeTemplate, UUID> {
	java.util.List<FeeTemplate> findByPropertyIdAndDefaultTemplateTrueAndDeletedAtIsNullOrderByRevisionDesc(UUID propertyId);
}
