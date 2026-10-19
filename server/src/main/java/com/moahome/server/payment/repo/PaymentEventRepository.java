package com.moahome.server.payment.repo;

import java.util.*;
import com.moahome.server.payment.domain.PaymentEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentEventRepository extends JpaRepository<PaymentEvent, UUID> {

}
