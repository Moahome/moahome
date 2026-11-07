package com.moahome.server.expense.repo;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.moahome.server.expense.domain.PayableExpense;

public interface PayableExpenseRepository extends JpaRepository<PayableExpense, UUID> {
	List<PayableExpense> findByPropertyIdOrderByOccurredDateDescCreatedAtDesc(UUID propertyId);
}
