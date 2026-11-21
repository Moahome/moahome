package com.moahome.server.banking.repo;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.moahome.server.banking.domain.BankAccount;

public interface BankAccountRepository extends JpaRepository<BankAccount, UUID> {
	/** 모든 통장 조회에서 저장된 최초 등록 순서를 공통으로 사용합니다. */
	@Query("select a from BankAccount a where a.propertyId = :propertyId and a.deletedAt is null order by a.registrationOrder, a.createdAt, a.id")
	List<BankAccount> findByPropertyIdAndDeletedAtIsNull(UUID propertyId);

	/** 관리대상 잠금 아래 삭제·종료된 통장의 번호도 재사용하지 않고 다음 등록 순서를 배정합니다. */
	@Query("select coalesce(max(a.registrationOrder), -1) + 1 from BankAccount a where a.propertyId = :propertyId")
	int nextRegistrationOrder(UUID propertyId);

	interface Usage {
		UUID getAccountId();

		LocalDate getFirstUse();
	}

	/** 실제 입출금·수납·지출만 사용 이력으로 확인합니다. 초기 잔고·잔액 확인으로 생성 전 월이나 빈 종료 계좌를 되살리지 않습니다. */
	@Query(value = """
	    WITH common_accounts AS (
	      SELECT id FROM bank_accounts WHERE property_id=:propertyId AND deleted_at IS NULL AND building_id IS NULL
	    ), usage_dates AS (
	      SELECT bank_account_id AS account_id, transaction_date AS used_on FROM bank_transactions WHERE property_id=:propertyId
	      UNION ALL SELECT bank_account_id, payment_date FROM payments WHERE property_id=:propertyId
	      UNION ALL SELECT bank_account_id, expense_date FROM expenses WHERE property_id=:propertyId
	      UNION ALL SELECT p.counterpart_account_id,t.transaction_date FROM bank_transfer_postings p
	        JOIN bank_transactions t ON t.id=p.source_transaction_id WHERE p.property_id=:propertyId
          UNION ALL SELECT manual_outgoing_account_id,manual_date FROM bank_transfer_postings
            WHERE property_id=:propertyId AND manual_outgoing_account_id IS NOT NULL
          UNION ALL SELECT counterpart_account_id,manual_date FROM bank_transfer_postings
            WHERE property_id=:propertyId AND manual_outgoing_account_id IS NOT NULL

	    )
	    SELECT a.id AS "accountId",min(u.used_on) AS "firstUse" FROM common_accounts a
	      LEFT JOIN usage_dates u ON u.account_id=a.id GROUP BY a.id
	    """, nativeQuery = true)
	List<Usage> findUsageByPropertyId(UUID propertyId);

	/**
	 * 잔액 자료의 실제 저장 시각을 통장별로 집계합니다. 조회 시각·거래일을 갱신일로 만들지 않습니다.
	 * 취소·삭제도 자료 변경이므로 이력을 포함하고, 이체는 양쪽 통장에 같은 변경 시각을 반영합니다.
	 * 모든 원천은 관리대상으로 제한하며 은행 직접 확인값은 현재 장부 잔액의 원천에서 제외합니다.
	 */
	@Query(value = """
	    select updates.account_id as "accountId", max(updates.changed_at) as "updatedAt"
	    from (
	      select bank_account_id as account_id, greatest(imported_at, deleted_at) as changed_at
	      from bank_transactions where property_id = ?1
	      union all
	      select bank_account_id, greatest(created_at, updated_at, confirmed_at, canceled_at, deleted_at)
	      from payments where property_id = ?1
	      union all
	      select bank_account_id, greatest(confirmed_at, deleted_at)
	      from expenses where property_id = ?1
	      union all
	      select o.bank_account_id, greatest(o.recorded_at, b.confirmed_at, b.canceled_at)
	      from bank_opening_balances o
	      left join opening_balance_batches b on b.id = o.batch_id and b.property_id = o.property_id
	      where o.property_id = ?1 and (o.batch_id is null or b.status in ('CONFIRMED', 'CANCELED'))
	      union all
	      select bank_account_id, greatest(created_at, updated_at)
	      from building_cash_openings where property_id = ?1
	      union all
	      select bank_account_id, changed_at
	      from building_cash_opening_changes where property_id = ?1
	      union all
	      select a.account_id, greatest(p.created_at, p.canceled_at, p.deleted_at)
	      from bank_transfer_postings p
	      left join bank_transactions t on t.id = p.source_transaction_id and t.property_id = p.property_id
	      cross join lateral (values (coalesce(p.manual_outgoing_account_id, t.bank_account_id)),
	        (p.counterpart_account_id)) a(account_id)
	      where p.property_id = ?1
	      union all
	      select t.bank_account_id, greatest(p.created_at, p.canceled_at)
	      from bank_transfers p
	      join bank_transactions t on t.property_id = p.property_id and t.id in (p.outgoing_id, p.incoming_id)
	      where p.property_id = ?1
	      union all
	      select cast(cast(request_body as jsonb)->>'accountId' as uuid), changed_at
	      from initial_balance_changes
	      where property_id = ?1 and kind in ('ACCOUNT', 'BUILDING')
	      union all
	      select a.id, c.changed_at
	      from initial_balance_changes c
	      cross join lateral jsonb_array_elements(cast(c.details as jsonb)) d
	      join bank_accounts a on a.property_id = c.property_id
	        and a.id = cast(d->>'targetId' as uuid)
	      where c.property_id = ?1 and c.kind = 'HANDOVER'
	    ) updates
	    where updates.account_id is not null
	    group by updates.account_id
	    """, nativeQuery = true)
	List<DataUpdate> dataUpdates(UUID propertyId);

	interface DataUpdate {
		UUID getAccountId();
		java.time.Instant getUpdatedAt();
	}
}
