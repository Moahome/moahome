package com.moahome.server.expense.service;

import java.time.Clock;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import com.moahome.server.accounting.repo.AccountingAccountRepository;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.banking.service.BankingService;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.expense.dto.PayableRequests;
import com.moahome.server.expense.repo.ExpenseRepository;
import com.moahome.server.expense.repo.PayableExpenseRepository;
import com.moahome.server.expense.repo.PayableSettlementRepository;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.dto.ManagementPropertyResponse;
import com.moahome.server.property.repo.BuildingRepository;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.property.service.ManagementAccessService;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class PayableServiceTest {
	@Test
	void managerCannotCreateLinkOrCancelAccountingPayables() {
		UUID actor = UUID.randomUUID();
		UUID property = UUID.randomUUID();
		UUID payable = UUID.randomUUID();
		ManagementAccessService access = mock(ManagementAccessService.class);
		PropertyRepository properties = mock(PropertyRepository.class);
		PayableExpenseRepository sources = mock(PayableExpenseRepository.class);
		PayableSettlementRepository payments = mock(PayableSettlementRepository.class);
		BankingService banking = mock(BankingService.class);
		when(access.getManagementContext(actor, property))
			.thenReturn(new ManagementPropertyResponse(property, "검증 대상", PropertyMemberRole.MANAGER));
		PayableService service = new PayableService(access, properties, mock(BuildingRepository.class),
			mock(AccountingAccountRepository.class), sources, payments, mock(ExpenseRepository.class), banking,
			mock(PayableSourceService.class), mock(PaymentTextSecurity.class), Clock.systemUTC());
		assertThatThrownBy(() -> service.create(actor, property, new PayableRequests.Create(payable, LocalDate.of(2026, 11, 1),
			"청소비", "업체", null, UUID.randomUUID(), null, "100000"))).isInstanceOf(AuthException.class);
		assertThatThrownBy(() -> service.settle(actor, property, payable,
			new PayableRequests.Settle(UUID.randomUUID(), UUID.randomUUID()))).isInstanceOf(AuthException.class);
		assertThatThrownBy(() -> service.cancel(actor, property, payable)).isInstanceOf(AuthException.class);
		assertThatThrownBy(() -> service.cancelPayment(actor, property, payable, UUID.randomUUID())).isInstanceOf(AuthException.class);
		verifyNoInteractions(properties, sources, payments, banking);
	}
}
