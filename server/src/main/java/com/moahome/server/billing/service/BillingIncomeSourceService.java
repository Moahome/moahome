package com.moahome.server.billing.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.moahome.server.billing.domain.BillingPeriod;
import com.moahome.server.billing.domain.Charge;
import com.moahome.server.billing.domain.ChargeItem;
import com.moahome.server.billing.dto.BillingIncomeSource;
import com.moahome.server.billing.repo.BillingPeriodRepository;
import com.moahome.server.billing.repo.ChargeItemRepository;
import com.moahome.server.billing.repo.ChargeRepository;

@Service
public class BillingIncomeSourceService {
	private final ChargeRepository charges;
	private final ChargeItemRepository items;
	private final BillingPeriodRepository periods;

	public BillingIncomeSourceService(ChargeRepository charges, ChargeItemRepository items,
		BillingPeriodRepository periods) {
		this.charges = charges;
		this.items = items;
		this.periods = periods;
	}

	/** 확정 청구의 당시 세대 표시를 전달하며 조회로 새 부과를 생성하거나 취소·초안·인계 미수를 수익에 넣지 않습니다. */
	@Transactional(readOnly = true)
	public List<BillingIncomeSource> get(UUID property) {
		List<Charge> issued = charges.findByPropertyId(property).stream()
			.filter(charge -> "ISSUED".equals(charge.getStatus()) && "MONTHLY".equals(charge.getChargeType()))
			.toList();
		Map<UUID, BillingPeriod> byPeriod = periods.findByPropertyIdOrderByBillingYearDescBillingMonthDesc(property)
			.stream().collect(Collectors.toMap(BillingPeriod::getId, Function.identity()));
		Map<UUID, List<ChargeItem>> byCharge = issued.isEmpty() ? Map.of()
			: items.findByChargeIdInOrderBySortOrderAsc(issued.stream().map(Charge::getId).toList()).stream()
				.collect(Collectors.groupingBy(ChargeItem::getChargeId));
		List<BillingIncomeSource> result = new ArrayList<>();
		for (Charge charge : issued) {
			BillingPeriod period = byPeriod.get(charge.getBillingPeriodId());
			if (period == null)
				throw new IllegalStateException("Missing billing period");
			result.add(new BillingIncomeSource(charge.getId(), charge.getUnitId(), period.month().toString(),
				charge.getBuildingName(), charge.getUnitNumber(), charge.getDisplayName(), charge.getTotalAmount(),
				byCharge.getOrDefault(charge.getId(), List.of())
					.stream().map(item -> new BillingIncomeSource.Item(item.getId(), item.getSourceTemplateItemId(), item.getItemName(),
						item.getItemCode(), item.getAmount(), item.getRevenueAccountId())).toList()));
		}
		return List.copyOf(result);
	}
}
