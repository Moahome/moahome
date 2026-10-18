package com.moahome.server.banking.dto;

import java.time.OffsetDateTime;
import java.util.UUID;
import com.moahome.server.common.validation.TextInput;
import com.moahome.server.common.validation.TextValues;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public final class BankAccountSettings {
    private BankAccountSettings() {}

    public record Request(
        @NotNull UUID accountId,
        @NotNull OffsetDateTime updatedAt,
        @TextInput(max=20) String bankCode,
        @TextInput(max=50) String bankName,
        @NotNull @Pattern(regexp="[0-9]{4,50}") String accountNumber,
        @TextInput(max=50) String holderName
    ) {
        /** 등록과 같은 번호 정리 기준을 사용하고 잘못된 문자를 임의로 삭제하지 않습니다. */
        public Request {
            bankCode = TextValues.strip(bankCode);
            bankName = TextValues.strip(bankName);
            holderName = TextValues.strip(holderName);
            accountNumber = TextValues.strip(accountNumber);
            if (accountNumber != null && accountNumber.matches("[0-9 -]*")) {
                accountNumber = accountNumber.replace(" ", "").replace("-", "");
            }
        }
        @Override public String toString() { return "BankAccountRequest[REDACTED]"; }
    }

    public record Response(UUID propertyId, UUID accountId, OffsetDateTime updatedAt,
        String bankCode, String bankName, String accountNumber, String holderName) {
        @Override public String toString() { return "BankAccountResponse[REDACTED]"; }
    }
}
