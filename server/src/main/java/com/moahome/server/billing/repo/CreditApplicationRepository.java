package com.moahome.server.billing.repo;
import java.util.*;
import com.moahome.server.billing.domain.CreditApplication;
import org.springframework.data.jpa.repository.JpaRepository;
public interface CreditApplicationRepository extends JpaRepository<CreditApplication,UUID> { List<CreditApplication> findByPropertyId(UUID property); }
