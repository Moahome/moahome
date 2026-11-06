package com.moahome.server.accounting.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.moahome.server.accounting.domain.RevenueAccountingReview;

public interface RevenueAccountingReviewRepository extends JpaRepository<RevenueAccountingReview, UUID> {
	List<RevenueAccountingReview> findByPropertyIdOrderByRevisionDesc(UUID propertyId);

	Optional<RevenueAccountingReview> findFirstByPropertyIdAndSourceTemplateItemIdOrderByRevisionDesc(UUID propertyId,
		UUID sourceTemplateItemId);
}
