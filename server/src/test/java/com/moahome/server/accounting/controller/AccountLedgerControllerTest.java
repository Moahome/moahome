package com.moahome.server.accounting.controller;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import com.moahome.server.accounting.service.AccountLedgerService;
import com.moahome.server.accounting.exception.AccountingException;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.exception.AuthErrorCode;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

@WebMvcTest(AccountLedgerController.class)
@ActiveProfiles("test")
@Import(IncomeStatementControllerTest.Security.class)
class AccountLedgerControllerTest {
	@Autowired
	MockMvc mvc;
	@MockitoBean
	AccountLedgerService service;

	@Test
	void authenticatesBeforeReadingAndPassesAllFiltersWithoutCaching() throws Exception {
		UUID actor = UUID.randomUUID(), property = UUID.randomUUID(), account = UUID.randomUUID(), building = UUID.randomUUID();
		String url = "/api/properties/" + property + "/accounting/ledger";
		mvc.perform(get(url)).andExpect(status().isUnauthorized());
		verifyNoInteractions(service);
		mvc.perform(get(url).param("startMonth", "2026-10").param("endMonth", "2026-11")
			.param("accountId", account.toString()).param("buildingId", building.toString())
			.with(authentication(UsernamePasswordAuthenticationToken.authenticated(
				new AuthPrincipal(actor.toString(), UUID.randomUUID().toString()), null, List.of()))))
			.andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
		verify(service).get(actor, property, "2026-10", "2026-11", building, account);
	}

	@Test
	void passesMultipleAccountsAndRejectsMalformedAccountList() throws Exception {
		UUID actor = UUID.randomUUID(), property = UUID.randomUUID(), first = UUID.randomUUID(), second = UUID.randomUUID();
		String url = "/api/properties/" + property + "/accounting/ledger";
		var identity = authentication(UsernamePasswordAuthenticationToken.authenticated(
			new AuthPrincipal(actor.toString(), UUID.randomUUID().toString()), null, List.of()));
		mvc.perform(get(url).param("accountIds", first + "," + second).with(identity)).andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", "no-store"));
		verify(service).getSelected(actor, property, null, null, null, List.of(first, second));
		mvc.perform(get(url).param("accountIds", first + ",invalid").with(identity)).andExpect(status().isBadRequest());
	}

	@Test
	void reportsInvalidAccountForbiddenAndStoreFailureWithAccountingErrorContract() throws Exception {
		UUID actor = UUID.randomUUID(), property = UUID.randomUUID();
		String url = "/api/properties/" + property + "/accounting/ledger";
		var identity = authentication(UsernamePasswordAuthenticationToken.authenticated(
			new AuthPrincipal(actor.toString(), UUID.randomUUID().toString()), null, List.of()));
		mvc.perform(get(url).param("accountId", "invalid-uuid").with(identity)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_ACCOUNTING_REQUEST"));
		verifyNoInteractions(service);
		doThrow(new AccountingException("INVALID_ACCOUNTING_ACCOUNT"))
			.when(service).get(actor, property, null, null, null, null);
		mvc.perform(get(url).with(identity)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_ACCOUNTING_ACCOUNT"))
			.andExpect(header().string("Cache-Control", "no-store"));
		doThrow(new AuthException(AuthErrorCode.ACCESS_DENIED))
			.when(service).get(actor, property, null, null, null, null);
		mvc.perform(get(url).with(identity)).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
		doThrow(new DataAccessResourceFailureException("private database details"))
			.when(service).get(actor, property, null, null, null, null);
		mvc.perform(get(url).with(identity)).andExpect(status().isServiceUnavailable())
			.andExpect(jsonPath("$.code").value("ACCOUNTING_SERVICE_UNAVAILABLE"))
			.andExpect(jsonPath("$.message").value("회계 자료를 불러오지 못했습니다."));
	}
}
