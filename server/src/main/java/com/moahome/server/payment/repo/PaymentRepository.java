package com.moahome.server.payment.repo;
import java.util.*;
import com.moahome.server.payment.domain.Payment;
import org.springframework.data.jpa.repository.JpaRepository;
public interface PaymentRepository extends JpaRepository<Payment,UUID> {
    List<Payment> findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(UUID propertyId);
}
