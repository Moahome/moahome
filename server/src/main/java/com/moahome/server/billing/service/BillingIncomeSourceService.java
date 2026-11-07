package com.moahome.server.billing.service;

import java.util.ArrayList;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.time.YearMonth;
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
						item.getItemCode(), item.getAmount(), item.getRevenueAccountId())).toList(), period.getBillingDate()));
		}
		return List.copyOf(result);
	}

	/** 실제 첫 확정 부과월을 우선하고 아직 부과 전이면 관리 시작 때 정한 첫 부과월을 사용합니다. */
	@Transactional(readOnly = true)
	public YearMonth firstMonth(UUID property, LocalDate plannedFirstMonth) {
		return get(property).stream().map(source -> YearMonth.parse(source.month())).min(YearMonth::compareTo)
			.orElse(plannedFirstMonth == null ? null : YearMonth.from(plannedFirstMonth));
	}
	public record ReceivableSource(UUID id, UUID unitId, String buildingName, String unitNumber,
		LocalDate date, BigDecimal amount, boolean opening) {
	}

	/** 미수 원본은 수익 항목 분류와 분리하며 인계 미수도 당시 동·호수와 기준 날짜를 보존합니다. */
	@Transactional(readOnly = true)
	public List<ReceivableSource> receivables(UUID property) {
		Map<UUID, BillingPeriod> byPeriod = periods.findByPropertyIdOrderByBillingYearDescBillingMonthDesc(property)
			.stream().collect(Collectors.toMap(BillingPeriod::getId, Function.identity()));
		return charges.findByPropertyId(property).stream().filter(charge -> "ISSUED".equals(charge.getStatus()))
			.map(charge -> {
				boolean opening = "OPENING_RECEIVABLE".equals(charge.getChargeType());
				LocalDate date = opening ? charge.getDueDate()
					: byPeriod.get(charge.getBillingPeriodId()).getBillingDate();
				return new ReceivableSource(charge.getId(), charge.getUnitId(), charge.getBuildingName(),
					charge.getUnitNumber(), date, charge.getTotalAmount(), opening);
			}).toList();
	}

}
