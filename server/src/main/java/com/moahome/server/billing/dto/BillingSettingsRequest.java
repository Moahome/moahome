package com.moahome.server.billing.dto;
import java.util.*;
import com.moahome.server.billing.domain.FeeItemCode;
import com.moahome.server.common.validation.TextInput;
import com.moahome.server.common.validation.TextValues;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

public record BillingSettingsRequest(
    @NotNull UUID revisionId,
    @NotBlank @Pattern(regexp="[1-9][0-9]{3}-(0[1-9]|1[0-2])") String effectiveMonth,
    @TextInput(max=1000) String reason,
    @NotEmpty List<@NotNull @Valid Item> items
) {
    public BillingSettingsRequest { reason = TextValues.strip(reason); }
    public record Item(FeeItemCode itemCode, @TextInput(max=100) String itemName,
        @NotNull @Min(-999999999999999L) @Max(999999999999999L) Long defaultAmount) {
        public Item { itemName = TextValues.strip(itemName); }
    }
}
