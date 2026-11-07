package com.moahome.server.expense.repo;

import java.util.*;
import com.moahome.server.expense.domain.Expense;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ExpenseRepository extends JpaRepository<Expense, UUID> {
	@Query("select e from Expense e where e.propertyId = ?1 and e.deletedAt is null order by e.confirmedAt desc")
	List<Expense> findByPropertyIdOrderByConfirmedAtDesc(UUID property);

	Optional<Expense> findByBankTransactionId(UUID transaction);
}
