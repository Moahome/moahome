package com.moahome.server.billing.repo;
import java.util.*;
import com.moahome.server.billing.domain.ChargeItem;
import org.springframework.data.jpa.repository.JpaRepository;
public interface ChargeItemRepository extends JpaRepository<ChargeItem, UUID> {
    List<ChargeItem> findByChargeIdInOrderBySortOrderAsc(Collection<UUID> chargeIds);
}
