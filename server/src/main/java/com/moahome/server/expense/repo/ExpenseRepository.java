package com.moahome.server.expense.repo;

import java.util.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import com.moahome.server.expense.domain.Expense;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ExpenseRepository extends JpaRepository<Expense, UUID> {
	@Query("select e from Expense e where e.propertyId = ?1 and e.deletedAt is null order by e.confirmedAt desc")
	List<Expense> findByPropertyIdOrderByConfirmedAtDesc(UUID property);

	Optional<Expense> findByBankTransactionId(UUID transaction);

	List<Expense> findByBankTransactionIdIn(Collection<UUID> transactions);

	/** 후보 검사는 통장·일자 인덱스를 사용하고 이미 연결·삭제된 수동 지출은 제외합니다. */
	@Query("select count(e) > 0 from Expense e where e.propertyId = ?1 and e.bankAccountId = ?2 "
	    + "and e.expenseDate = ?3 and e.totalAmount = ?4 and e.sourceType = 'MANUAL' "
	    + "and e.deletedAt is null and e.bankTransactionId is null")
	boolean existsManualCandidate(UUID property, UUID account, LocalDate date, BigDecimal amount);

	/** 계정 설정의 사용 여부는 취소·삭제한 지출 원천까지 보존하여 판단합니다. */
	List<Expense> findAllByPropertyId(UUID property);
}
