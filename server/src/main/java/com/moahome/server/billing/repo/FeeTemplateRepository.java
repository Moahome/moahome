package com.moahome.server.billing.repo;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.moahome.server.billing.domain.FeeTemplate;

public interface FeeTemplateRepository extends JpaRepository<FeeTemplate, UUID> {
	List<FeeTemplate> findByPropertyIdAndDefaultTemplateTrueAndDeletedAtIsNullOrderByRevisionDesc(
	    UUID propertyId);
}
