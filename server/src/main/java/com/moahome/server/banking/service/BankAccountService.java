package com.moahome.server.banking.service;

import java.util.UUID;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.banking.domain.BankAccount;
import com.moahome.server.banking.domain.BankAccountStatus;
import com.moahome.server.banking.dto.BankAccountSettings;
import com.moahome.server.banking.repo.BankAccountRepository;
import com.moahome.server.common.security.AccountNumberSecurity;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.property.service.ManagementAccessService;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("!test")
@Transactional(readOnly=true)
public class BankAccountService {
    private final ManagementAccessService access;
    private final PropertyRepository properties;
    private final BankAccountRepository accounts;
    private final AccountNumberSecurity security;

    public BankAccountService(ManagementAccessService access, PropertyRepository properties,
        BankAccountRepository accounts, @Lazy AccountNumberSecurity security) {
        this.access=access; this.properties=properties; this.accounts=accounts; this.security=security;
    }

    /** 계좌번호 원문은 현재 관리소장 권한을 확인한 조회에서만 복호화합니다. */
    public BankAccountSettings.Response read(UUID userId, UUID propertyId) {
        requireAdmin(userId, propertyId);
        return response(primaryAccount(propertyId));
    }

    /** 업로드·수납과 같은 관리대상 잠금 아래 계좌 정보만 정정하고 과거 거래·잔고는 다시 쓰지 않습니다. */
    @Transactional
    public BankAccountSettings.Response correct(UUID userId, UUID propertyId, BankAccountSettings.Request request) {
        requireAdmin(userId, propertyId);
        properties.findForUnitUpdate(propertyId).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
        var account=primaryAccount(propertyId);
        if (!account.getId().equals(request.accountId())) throw new PaymentException("BANK_ACCOUNT_CONFLICT");
        var protectedNumber=security.protect(request.accountNumber());
        // 응답 유실 후 같은 값의 재시도는 다시 정정하지 않고 현재 저장 결과를 반환합니다.
        boolean same=account.getBankCode().equals(request.bankCode()) && account.getBankName().equals(request.bankName())
            && account.getHolderNameSnapshot().equals(request.holderName())
            && account.getAccountNumberHmac().equals(protectedNumber.hmac());
        if (same) return response(account);
        if (!account.getUpdatedAt().isEqual(request.updatedAt())) throw new PaymentException("BANK_ACCOUNT_CONFLICT");
        boolean duplicate=accounts.findByPropertyIdAndDeletedAtIsNull(propertyId).stream()
            .anyMatch(other -> !other.getId().equals(account.getId()) && other.getBankCode().equals(request.bankCode())
                && other.getAccountNumberHmac().equals(protectedNumber.hmac()));
        if (duplicate) throw new PaymentException("BANK_ACCOUNT_DUPLICATE");
        account.correctDetails(request.bankCode(), request.bankName(), request.holderName(), protectedNumber);
        accounts.flush();
        return response(account);
    }

    /** 변경 권한과 계좌 원문 조회 권한은 기존 통장 관리의 관리소장 범위로 제한합니다. */
    private void requireAdmin(UUID userId, UUID propertyId) {
        if (access.getManagementContext(userId, propertyId).role()!=PropertyMemberRole.ADMIN) {
            throw new AuthException(AuthErrorCode.ACCESS_DENIED);
        }
    }

    /** 여러 기본 계좌나 동별 계좌를 임의로 선택해 정정하지 않도록 대상을 한 건으로 제한합니다. */
    private BankAccount primaryAccount(UUID propertyId) {
        var current=accounts.findByPropertyIdAndDeletedAtIsNull(propertyId).stream()
            .filter(account -> account.isPrimary() && account.getBuildingId()==null && account.getStatus()==BankAccountStatus.ACTIVE).toList();
        if (current.size()!=1) throw new PaymentException("PAYMENT_ACCOUNT_UNAVAILABLE");
        return current.getFirst();
    }

    private BankAccountSettings.Response response(BankAccount account) {
        return new BankAccountSettings.Response(account.getPropertyId(), account.getId(), account.getUpdatedAt(),
            account.getBankCode(), account.getBankName(), security.decrypt(account.getAccountNumberEncrypted()), account.getHolderNameSnapshot());
    }
}
