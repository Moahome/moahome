package com.moahome.server.billing.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import com.moahome.server.billing.domain.FeeItemCode;

/** 수납과 분리한 확정 부과 스냅샷만 회계 조회 경계로 전달합니다. */
public record BillingIncomeSource(UUID chargeId, UUID unitId, String month, String buildingName,
	String unitNumber, String displayName, BigDecimal amount, List<Item> items) {
	public record Item(UUID id, UUID sourceTemplateItemId, String name, FeeItemCode code, BigDecimal amount,
		UUID revenueAccountId) {
	}
}
