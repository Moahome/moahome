package com.moahome.server.accounting.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.moahome.server.accounting.domain.ExpenseAccountingReview;

public interface ExpenseAccountingReviewRepository extends JpaRepository<ExpenseAccountingReview, UUID> {
	List<ExpenseAccountingReview> findByPropertyIdOrderByRevisionDesc(UUID propertyId);

	Optional<ExpenseAccountingReview> findFirstByPropertyIdAndExpenseIdOrderByRevisionDesc(UUID propertyId,
		UUID expenseId);
}
