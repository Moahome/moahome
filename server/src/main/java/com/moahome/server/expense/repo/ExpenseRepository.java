package com.moahome.server.expense.repo;

import java.util.*;
import com.moahome.server.expense.domain.Expense;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExpenseRepository extends JpaRepository<Expense, UUID> {
	List<Expense> findByPropertyIdOrderByConfirmedAtDesc(UUID property);

	Optional<Expense> findByBankTransactionId(UUID transaction);
}
