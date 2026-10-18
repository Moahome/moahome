package com.moahome.server.billing.repo;
import java.util.*;
import com.moahome.server.billing.domain.BankOpeningBalance;
import org.springframework.data.jpa.repository.JpaRepository;
public interface BankOpeningBalanceRepository extends JpaRepository<BankOpeningBalance,UUID> { List<BankOpeningBalance> findByPropertyIdAndBatchIdIsNullOrderByRevisionDesc(UUID property); List<BankOpeningBalance> findByBatchId(UUID batch); void deleteByBatchId(UUID batch); }
