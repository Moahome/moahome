package com.moahome.server.billing.dto;

import java.util.*;
import com.moahome.server.billing.domain.BillingMode;
import com.moahome.server.billing.domain.FeeItemCode;
import com.moahome.server.common.validation.TextInput;
import com.moahome.server.common.validation.TextValues;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

public record BillingSettingsRequest(@NotNull UUID revisionId,
    @NotBlank @Pattern(regexp = "[1-9][0-9]{3}-(0[1-9]|1[0-2])") String effectiveMonth,
    @TextInput(max = 1000) String reason, @NotNull List<@NotNull @Valid Item> items,
    BillingMode mode, List<@NotNull @Valid BuildingItems> buildingItems,
    BillingMode temporaryMode, List<@NotNull @Valid TemporaryItem> temporaryItems,
    @Pattern(regexp = "[1-9][0-9]{3}-(0[1-9]|1[0-2])") String temporaryMonth, UUID requestId) {
	public BillingSettingsRequest {
		reason = TextValues.strip(reason);
		mode = mode == null ? BillingMode.ALL : mode;
		temporaryMode = temporaryMode == null ? BillingMode.ALL : temporaryMode;
		buildingItems = buildingItems == null ? List.of() : buildingItems;
		temporaryItems = temporaryItems == null ? List.of() : temporaryItems;
	}

	public BillingSettingsRequest(UUID revisionId, String month, String reason, List<Item> items) {
		this(revisionId, month, reason, items, BillingMode.ALL, List.of(), BillingMode.ALL, List.of(), null, null);
	}

	public BillingSettingsRequest(UUID revisionId, String month, String reason, List<Item> items,
	    BillingMode mode, List<BuildingItems> buildingItems, BillingMode temporaryMode, List<TemporaryItem> temporaryItems) {
		this(revisionId, month, reason, items, mode, buildingItems, temporaryMode, temporaryItems, null, null);
	}

	/** 선택하지 않은 범위의 항목을 함께 보내거나 기본 항목을 비운 요청은 API 경계에서 거부합니다. */
	@AssertTrue
	public boolean isScopeValid() {
		if (items == null)
			return true;
		return mode == BillingMode.ALL ? !items.isEmpty() && buildingItems.isEmpty()
		    : items.isEmpty() && !buildingItems.isEmpty();
	}

	public record Item(FeeItemCode itemCode, @TextInput(max = 100) String itemName,
	    @NotNull @Min(-999999999999999L) @Max(999999999999999L) Long defaultAmount) {
		public Item {
			itemName = TextValues.strip(itemName);
		}
	}

	public record BuildingItems(@NotNull UUID buildingId, @NotEmpty List<@NotNull @Valid Item> items) {
	}

	public record TemporaryItem(UUID buildingId, FeeItemCode itemCode, @TextInput(max = 100) String itemName,
	    @NotNull @Min(-999999999999999L) @Max(999999999999999L) Long defaultAmount, @Size(max = 500) String note,
	    @Pattern(regexp = "[1-9][0-9]{3}-(0[1-9]|1[0-2])") String month) {
		public TemporaryItem(UUID buildingId, FeeItemCode code, String name, Long amount, String note) {
			this(buildingId, code, name, amount, note, null);
		}

		public TemporaryItem {
			itemName = TextValues.strip(itemName);
		}
	}
}
