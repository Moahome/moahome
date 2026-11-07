package com.moahome.server.accounting.repo;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import com.moahome.server.accounting.domain.AccountingTransferMatch;

public interface AccountingTransferMatchRepository extends JpaRepository<AccountingTransferMatch, UUID> {
	@Query(value = "SELECT m.* FROM accounting_transfer_matches m JOIN expenses e ON e.id=m.expense_id "
		+ "JOIN payments p ON p.id=m.payment_id WHERE m.property_id=?1 AND e.deleted_at IS NULL "
		+ "AND p.deleted_at IS NULL AND p.status='CONFIRMED' AND NOT EXISTS (SELECT 1 FROM bank_transactions t "
		+ "WHERE t.id IN (e.bank_transaction_id,p.bank_transaction_id) AND t.deleted_at IS NOT NULL)", nativeQuery = true)
	List<AccountingTransferMatch> findByPropertyId(UUID propertyId);
}
