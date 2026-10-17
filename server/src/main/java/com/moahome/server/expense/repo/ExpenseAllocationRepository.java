package com.moahome.server.expense.repo;
import java.util.*;
import com.moahome.server.expense.domain.ExpenseAllocation;
import org.springframework.data.jpa.repository.JpaRepository;
public interface ExpenseAllocationRepository extends JpaRepository<ExpenseAllocation,UUID> {
    List<ExpenseAllocation> findByPropertyIdOrderBySortOrderAsc(UUID property);
}
