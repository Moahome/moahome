package com.moahome.server.expense.repo;

import java.util.UUID;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import com.moahome.server.expense.domain.ExpenseBankLink;

public interface ExpenseBankLinkRepository extends JpaRepository<ExpenseBankLink, UUID> {
	/** 업로드 재시도는 삭제된 은행 원본의 최초 연결도 찾아 원본을 다시 생성하지 않습니다. */
	@Query("select l from ExpenseBankLink l, BankTransaction b where l.bankTransactionId = b.id "
	    + "and l.propertyId = ?1 and b.bankAccountId = ?2 and b.deduplicationKey = ?3")
	List<ExpenseBankLink> findUploadHistory(UUID property, UUID account, String key);
}
