package com.moahome.server.accounting.repo;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import java.time.OffsetDateTime;
import java.time.Instant;
import com.moahome.server.accounting.domain.AccountingAccount;

public interface AccountingAccountRepository extends JpaRepository<AccountingAccount, UUID> {
	List<AccountingAccount> findByPropertyIdOrderByCreatedAtAscIdAsc(UUID propertyId);

	@Query(value = "select id from accounting_accounts where property_id=?1 and accounting_account_is_used(id)", nativeQuery = true)
	List<UUID> usedIds(UUID propertyId);

	@Query(value = "select expense_id as \"expenseId\",account_id as \"accountId\" from accounting_expense_account_links where property_id=?1", nativeQuery = true)
	List<AutomaticLink> automaticLinks(UUID propertyId);

	@Modifying
	@Query(value = "insert into accounting_expense_account_links(expense_id,property_id,account_id,created_by,created_at) values (?1,?2,?3,?4,?5) on conflict(expense_id) do nothing", nativeQuery = true)
	void rememberAutomatic(UUID expense, UUID property, UUID account, UUID actor, OffsetDateTime at);

	@Query(value = "select revision,name,code,report_group as \"reportGroup\",active,deleted_at as \"deletedAt\",changed_at as \"changedAt\" from accounting_account_changes where property_id=?1 and account_id=?2 order by revision desc", nativeQuery = true)
	List<Change> changes(UUID property, UUID account);

	interface AutomaticLink {
		UUID getExpenseId();
		UUID getAccountId();
	}

	interface Change {
		int getRevision();
		String getName();
		String getCode();
		String getReportGroup();
		boolean getActive();
		Instant getDeletedAt();
		Instant getChangedAt();
	}
}
