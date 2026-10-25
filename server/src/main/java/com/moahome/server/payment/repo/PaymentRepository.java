package com.moahome.server.payment.repo;

import java.util.*;
import com.moahome.server.payment.domain.Payment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PaymentRepository extends JpaRepository<Payment, UUID> {
	List<Payment> findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(UUID propertyId);

	/** 같은 관리대상의 입금자명별 최신 확정 세대 수납 한 건만 가져오며 등록 방식과 과거 세대 수는 조건으로 삼지 않습니다. */
	@Query(value = """
		select distinct on (p.payer_name_hmac) p.*
		from payments p
		where p.property_id = :propertyId and p.status = 'CONFIRMED'
		  and p.receipt_type = 'HOUSEHOLD' and p.deleted_at is null
		  and p.matched_unit_id is not null and p.auto_match_eligible
		order by p.payer_name_hmac, p.payment_date desc, p.created_at desc, p.id desc
		""", nativeQuery = true)
	List<Payment> findLatestConfirmedPayers(UUID propertyId);
}
