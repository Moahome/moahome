package com.moahome.server.billing.dto;

import java.util.*;
import java.time.*;
import com.moahome.server.billing.domain.FeeItemCode;
import com.moahome.server.billing.domain.BillingMode;

/** 원 단위 금액을 문자열로 보내 JavaScript의 안전 정수 범위를 넘는 여러 세대 합계도 보존합니다. */
public final class BillingResponse {
	private BillingResponse() {
	}

	public record Item(UUID id, FeeItemCode code, String name, String amount) {
	}

	public record BuildingOption(UUID id, String name) {
	}

	public record BuildingItems(UUID buildingId, List<Item> items) {
	}

	public record TemporaryItem(UUID id, UUID buildingId, FeeItemCode code, String name, String amount, String note) {
	}

	public record Template(UUID id, String effectiveMonth, List<Item> items, String reason, OffsetDateTime changedAt,
	    BillingMode mode, List<BuildingItems> buildingItems, BillingMode temporaryMode,
	    List<TemporaryItem> temporaryItems) {
		public Template(UUID id, String month, List<Item> items, String reason, OffsetDateTime at) {
			this(id, month, items, reason, at, BillingMode.ALL, List.of(), BillingMode.ALL, List.of());
		}
	}

	public record Settings(UUID propertyId, String currentMonth, String firstBillingMonth, LocalDate nextBillingDate,
	    UUID revisionId, Template current, Template scheduled, boolean managementStarted, boolean hasBuildings,
	    List<BuildingOption> buildings) {
		public Settings(UUID propertyId, String currentMonth, String firstBillingMonth, LocalDate nextBillingDate,
		    UUID revisionId, Template current, Template scheduled, boolean managementStarted) {
			this(propertyId, currentMonth, firstBillingMonth, nextBillingDate, revisionId, current, scheduled,
			    managementStarted, false, List.of());
		}
		public Settings(UUID propertyId, String currentMonth, String firstBillingMonth, LocalDate nextBillingDate,
		    UUID revisionId, Template current, Template scheduled) {
			this(propertyId, currentMonth, firstBillingMonth, nextBillingDate, revisionId, current, scheduled, true);
		}
	}

	public record ChargeRow(UUID id, UUID unitId, String building, String room, String displayName,
	    String representativeName, List<Item> items) {
	}

	public record Month(UUID propertyId, boolean hasBuildings, String month, LocalDate billingDate, LocalDate dueDate,
	    String status, String baseAmount, List<ChargeRow> charges) {
	}

	public record Period(String month, LocalDate billingDate, LocalDate dueDate, int unitCount, String totalAmount,
	    OffsetDateTime confirmedAt) {
	}

	public record History(UUID propertyId, List<Period> periods) {
	}
}
