package com.moahome.server.banking.repo;

import java.util.UUID;
import com.moahome.server.banking.domain.BankAccount;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BankAccountRepository extends JpaRepository<BankAccount, UUID> {
	/** 모든 통장 조회에서 저장된 최초 등록 순서를 공통으로 사용합니다. */
	@org.springframework.data.jpa.repository.Query("select a from BankAccount a where a.propertyId = :propertyId and a.deletedAt is null order by a.registrationOrder, a.createdAt, a.id")
	java.util.List<BankAccount> findByPropertyIdAndDeletedAtIsNull(UUID propertyId);

	/** 관리대상 잠금 아래 삭제·종료된 통장의 번호도 재사용하지 않고 다음 등록 순서를 배정합니다. */
	@org.springframework.data.jpa.repository.Query("select coalesce(max(a.registrationOrder), -1) + 1 from BankAccount a where a.propertyId = :propertyId")
	int nextRegistrationOrder(UUID propertyId);

	interface Usage {
		UUID getAccountId();
		java.time.LocalDate getFirstUse();
	}

	/** 입출금·수납·수동 지출·확정 잔고를 함께 확인합니다. 취소·삭제 감사도 실제 사용 이력으로 보존합니다. */
	@org.springframework.data.jpa.repository.Query(value = """
	    WITH common_accounts AS (
	      SELECT id FROM bank_accounts WHERE property_id=:propertyId AND deleted_at IS NULL AND building_id IS NULL
	    ), usage_dates AS (
	      SELECT bank_account_id AS account_id, transaction_date AS used_on FROM bank_transactions WHERE property_id=:propertyId
	      UNION ALL SELECT bank_account_id, payment_date FROM payments WHERE property_id=:propertyId
	      UNION ALL SELECT bank_account_id, expense_date FROM expenses WHERE property_id=:propertyId
	      UNION ALL SELECT COALESCE(bank_account_id,
	        (SELECT id FROM common_accounts WHERE (SELECT count(*) FROM common_accounts)=1)), cutoff_date
	        FROM building_cash_openings WHERE property_id=:propertyId
	      UNION ALL SELECT o.bank_account_id,o.cutoff_date FROM bank_opening_balances o
	        LEFT JOIN opening_balance_batches b ON b.id=o.batch_id AND b.property_id=o.property_id
	        WHERE o.property_id=:propertyId AND (o.batch_id IS NULL OR b.status='CONFIRMED')
	    )
	    SELECT a.id AS "accountId",min(u.used_on) AS "firstUse" FROM common_accounts a
	      LEFT JOIN usage_dates u ON u.account_id=a.id GROUP BY a.id
	    """, nativeQuery = true)
	java.util.List<Usage> findUsageByPropertyId(UUID propertyId);
}
