package com.moahome.server.banking.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.banking.domain.BankAccount;
import com.moahome.server.banking.domain.BankAccountStatus;
import com.moahome.server.banking.repo.BankAccountRepository;
import com.moahome.server.common.security.AccountNumberSecurity;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.dto.ManagementPropertyResponse;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.property.service.ManagementAccessService;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class BankAccountServiceTest {
    final ManagementAccessService access = mock(ManagementAccessService.class);
    final BankAccountRepository accounts = mock(BankAccountRepository.class);
    final AccountNumberSecurity security = mock(AccountNumberSecurity.class);
    final BankAccountService service = new BankAccountService(access, mock(PropertyRepository.class), accounts, security, Clock.systemUTC());
    final UUID user = UUID.randomUUID(), property = UUID.randomUUID(), id = UUID.randomUUID();

    @Test void maskedDetailDoesNotDecryptAndClosedAccountCanRevealOnlyOnRequest() {
        authorize(PropertyMemberRole.ADMIN);
        var account = account();
        when(account.getStatus()).thenReturn(BankAccountStatus.CLOSED);
        var detail = service.detail(user, property, id);
        assertThat(detail.last4()).isEqualTo("5678");
        assertThat(detail.status()).isEqualTo("CLOSED");
        verifyNoInteractions(security);
        when(account.getAccountNumberEncrypted()).thenReturn("protected-test-number");
        when(security.decrypt("protected-test-number")).thenReturn("00012345678");
        assertThat(service.revealNumber(user, property, id).accountNumber()).isEqualTo("00012345678");
        verify(access, times(2)).getManagementContext(user, property);
        verify(security).decrypt("protected-test-number");
    }

    @Test void nonAdminCannotReadDetailsOrDecryptNumbers() {
        authorize(PropertyMemberRole.MANAGER);
        assertThatThrownBy(() -> service.detail(user, property, id)).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> service.revealNumber(user, property, id)).isInstanceOf(AuthException.class);
        verifyNoInteractions(accounts, security);
    }

    @Test void missingForeignDeletedAndBuildingAccountsCannotBeReadOrRevealed() {
        authorize(PropertyMemberRole.ADMIN);
        when(accounts.findById(id)).thenReturn(Optional.empty());
        rejectsAccount();
        var account = account();
        when(account.getPropertyId()).thenReturn(UUID.randomUUID());
        rejectsAccount();
        when(account.getPropertyId()).thenReturn(property);
        when(account.getDeletedAt()).thenReturn(OffsetDateTime.now());
        rejectsAccount();
        when(account.getDeletedAt()).thenReturn(null);
        when(account.getBuildingId()).thenReturn(UUID.randomUUID());
        rejectsAccount();
        verifyNoInteractions(security);
    }

    private void rejectsAccount() {
        assertThatThrownBy(() -> service.detail(user, property, id)).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> service.revealNumber(user, property, id)).isInstanceOf(AuthException.class);
    }

    private void authorize(PropertyMemberRole role) {
        when(access.getManagementContext(user, property)).thenReturn(new ManagementPropertyResponse(property, "테스트 관리대상", role));
    }

    private BankAccount account() {
        var account = mock(BankAccount.class);
        when(accounts.findById(id)).thenReturn(Optional.of(account));
        when(account.getId()).thenReturn(id);
        when(account.getPropertyId()).thenReturn(property);
        when(account.getUpdatedAt()).thenReturn(OffsetDateTime.parse("2026-10-18T00:00:00Z"));
        when(account.getBankCode()).thenReturn("004");
        when(account.getBankName()).thenReturn("국민은행");
        when(account.getAccountLast4()).thenReturn("5678");
        when(account.getHolderNameSnapshot()).thenReturn("예시 예금주");
        when(account.getStatus()).thenReturn(BankAccountStatus.ACTIVE);
        return account;
    }
}
