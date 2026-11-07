package com.moahome.server.accounting.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import com.moahome.server.accounting.domain.AccountingAccount;
import com.moahome.server.accounting.domain.IncomeGroup;
import com.moahome.server.accounting.dto.AccountingRequests;
import com.moahome.server.accounting.exception.AccountingException;
import com.moahome.server.accounting.repo.AccountingAccountRepository;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.expense.repo.ExpenseRepository;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.domain.Property;
import com.moahome.server.property.dto.ManagementPropertyResponse;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.property.service.ManagementAccessService;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class AccountingAccountSettingsServiceTest {
	private final UUID actor = UUID.randomUUID(), property = UUID.randomUUID();
	private final Clock clock = Clock.systemUTC();
	private final ManagementAccessService access = mock(ManagementAccessService.class);
	private final PropertyRepository properties = mock(PropertyRepository.class);
	private final AccountingAccountRepository accounts = mock(AccountingAccountRepository.class);
	private final ExpenseRepository expenses = mock(ExpenseRepository.class);
	private final PaymentTextSecurity security = mock(PaymentTextSecurity.class);
	private final AccountingAccountSettingsService service = new AccountingAccountSettingsService(
		access, properties, accounts, expenses, security, clock);
	private final AccountingAccount custom = account("814", "소방점검비", IncomeGroup.OPERATING_EXPENSE);

	@BeforeEach
	void setup() {
		when(access.getManagementContext(actor, property)).thenReturn(context(PropertyMemberRole.ADMIN));
		when(properties.findForUnitUpdate(property)).thenReturn(Optional.of(mock(Property.class)));
		when(accounts.findByPropertyIdOrderByCreatedAtAscIdAsc(property)).thenReturn(List.of(custom));
		when(accounts.saveAndFlush(any(AccountingAccount.class))).thenAnswer(invocation -> invocation.getArgument(0));
	}

	@Test
	void managerCanReadWithoutWritingButCannotChangeAndRevokedAdminIsRechecked() {
		when(access.getManagementContext(actor, property)).thenReturn(context(PropertyMemberRole.MANAGER));
		assertThat(service.get(actor, property).canManage()).isFalse();
		verify(accounts, never()).saveAllAndFlush(any());
		assertThatThrownBy(() -> service.status(actor, property, custom.getId(), new AccountingRequests.AccountStatus(false, 0)))
			.isInstanceOf(AuthException.class);
		verify(properties, never()).findForUnitUpdate(any());
		when(access.getManagementContext(actor, property)).thenReturn(context(PropertyMemberRole.ADMIN), context(PropertyMemberRole.MANAGER));
		assertThatThrownBy(() -> service.delete(actor, property, custom.getId(), new AccountingRequests.DeleteAccount(0)))
			.isInstanceOf(AuthException.class);
	}

	@Test
	void usedCustomAccountCanBeRenamedButNeverRecodedReclassifiedOrDeleted() {
		when(accounts.usedIds(property)).thenReturn(List.of(custom.getId()));
		service.edit(actor, property, custom.getId(), new AccountingRequests.EditAccount("소방시설 점검비", IncomeGroup.OPERATING_EXPENSE, "814", 0));
		assertThat(custom.getName()).isEqualTo("소방시설 점검비");
		assertThat(custom.getRevision()).isEqualTo(1);
		assertThatThrownBy(() -> service.edit(actor, property, custom.getId(), new AccountingRequests.EditAccount("변경", IncomeGroup.OTHER_EXPENSE, "814", 1)))
			.isInstanceOf(AccountingException.class).hasMessage("ACCOUNTING_ACCOUNT_USED");
		assertThatThrownBy(() -> service.edit(actor, property, custom.getId(), new AccountingRequests.EditAccount("변경", IncomeGroup.OPERATING_EXPENSE, "815", 1)))
			.isInstanceOf(AccountingException.class).hasMessage("ACCOUNTING_ACCOUNT_USED");
		assertThatThrownBy(() -> service.delete(actor, property, custom.getId(), new AccountingRequests.DeleteAccount(1)))
			.isInstanceOf(AccountingException.class).hasMessage("ACCOUNTING_ACCOUNT_USED");
	}

	@Test
	void unusedCustomAccountCanChangeTypeAndCodeAndBeDeleted() {
		service.edit(actor, property, custom.getId(), new AccountingRequests.EditAccount("추가 자산", IncomeGroup.ASSET, "104", 0));
		assertThat(custom.getReportGroup()).isEqualTo(IncomeGroup.ASSET);
		assertThat(custom.getCode()).isEqualTo("104");
		service.status(actor, property, custom.getId(), new AccountingRequests.AccountStatus(false, 1));
		service.status(actor, property, custom.getId(), new AccountingRequests.AccountStatus(true, 2));
		service.delete(actor, property, custom.getId(), new AccountingRequests.DeleteAccount(3));
		assertThat(custom.getDeletedAt()).isNotNull();
		assertThat(custom.isSelectable()).isFalse();
	}

	@Test
	void basicExpenseCanStopAndResumeButBasicNonExpenseIsProtected() {
		AccountingAccount cost = account("802", "청소비", IncomeGroup.OPERATING_EXPENSE);
		AccountingAccount bank = AccountingAccount.create(property, "101", "통장", IncomeGroup.ASSET, "BANK", actor, OffsetDateTime.now(clock));
		when(accounts.findByPropertyIdOrderByCreatedAtAscIdAsc(property)).thenReturn(List.of(cost, bank));
		service.status(actor, property, cost.getId(), new AccountingRequests.AccountStatus(false, 0));
		service.status(actor, property, cost.getId(), new AccountingRequests.AccountStatus(true, 1));
		assertThatThrownBy(() -> service.edit(actor, property, cost.getId(), new AccountingRequests.EditAccount("이름 변경", IncomeGroup.OPERATING_EXPENSE, "802", 2)))
			.hasMessage("ACCOUNTING_ACCOUNT_PROTECTED");
		assertThatThrownBy(() -> service.delete(actor, property, cost.getId(), new AccountingRequests.DeleteAccount(2)))
			.hasMessage("ACCOUNTING_ACCOUNT_PROTECTED");
		assertThatThrownBy(() -> service.status(actor, property, bank.getId(), new AccountingRequests.AccountStatus(false, 0)))
			.hasMessage("ACCOUNTING_ACCOUNT_PROTECTED");
	}

	@Test
	void rejectsStaleRevisionOtherPropertyAccountAndCodeCollision() {
		assertThatThrownBy(() -> service.status(actor, property, custom.getId(), new AccountingRequests.AccountStatus(false, 1)))
			.hasMessage("ACCOUNTING_ACCOUNT_CONFLICT");
		assertThatThrownBy(() -> service.delete(actor, property, UUID.randomUUID(), new AccountingRequests.DeleteAccount(0)))
			.hasMessage("ACCOUNTING_ACCOUNT_NOT_FOUND");
		when(accounts.findByPropertyIdOrderByCreatedAtAscIdAsc(property)).thenReturn(List.of(custom,
			account("802", "청소비", IncomeGroup.OPERATING_EXPENSE)));
		assertThatThrownBy(() -> service.edit(actor, property, custom.getId(), new AccountingRequests.EditAccount("청소", IncomeGroup.OPERATING_EXPENSE, "802", 0)))
			.hasMessage("ACCOUNTING_CODE_CONFLICT");
	}

	@Test
	void createsBeforeBillingAndAllocatesCodeWithoutReusingDeletedRows() {
		UUID created = service.create(actor, property, new AccountingRequests.CreateAccount("특별 점검비", IncomeGroup.OPERATING_EXPENSE, null));
		assertThat(created).isNotNull();
		verify(accounts).saveAndFlush(argThat(value -> value.getCode().equals("815") && value.getName().equals("특별 점검비")));
		verifyNoInteractions(security);
	}

	private AccountingAccount account(String code, String name, IncomeGroup group) {
		return AccountingAccount.create(property, code, name, group, null, actor, OffsetDateTime.now(clock));
	}

	private ManagementPropertyResponse context(PropertyMemberRole role) {
		return new ManagementPropertyResponse(property, "관리대상", role);
	}
}
