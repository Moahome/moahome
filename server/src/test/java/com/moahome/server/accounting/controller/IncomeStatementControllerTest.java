package com.moahome.server.accounting.controller;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import com.moahome.server.accounting.service.AccountingWriteService;
import com.moahome.server.accounting.service.IncomeStatementService;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.eq;
import static org.mockito.Mockito.argThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

@WebMvcTest(IncomeStatementController.class)
@ActiveProfiles("test")
@Import(IncomeStatementControllerTest.Security.class)
class IncomeStatementControllerTest {
	@Autowired
	MockMvc mvc;
	@MockitoBean
	IncomeStatementService service;
	@MockitoBean
	AccountingWriteService writes;
	private final UUID actor = UUID.randomUUID(), propertyId = UUID.randomUUID();

	@Test
	void authenticatesBeforeReadingAndDoesNotCacheFinancialResponses() throws Exception {
		String url = "/api/properties/" + propertyId + "/accounting/income-statement";
		mvc.perform(get(url)).andExpect(status().isUnauthorized());
		verifyNoInteractions(service);
		mvc.perform(get(url).with(identity())).andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", "no-store"));
		when(service.get(actor, propertyId, null, null, null)).thenThrow(new AuthException(AuthErrorCode.ACCESS_DENIED));
		mvc.perform(get(url).with(identity())).andExpect(status().isForbidden());
	}

	@Test
	void validatesSetupAndReviewInputsBeforeCallingWriteService() throws Exception {
		String base = "/api/properties/" + propertyId + "/accounting";
		mvc.perform(post(base + "/settings").with(identity()).contentType("application/json")
			.content("{\"startMonth\":\"2026-13\",\"fiscalYearStartMonth\":0}"))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_ACCOUNTING_REQUEST"));
		mvc.perform(post(base + "/expenses/" + UUID.randomUUID() + "/reviews").with(identity())
			.contentType("application/json").content("{}"))
			.andExpect(status().isBadRequest());
		mvc.perform(post(base + "/revenue-items/" + UUID.randomUUID() + "/reviews").with(identity())
			.contentType("application/json").content("{\"expectedRevision\":0,\"reason\":\"확인\"}"))
			.andExpect(status().isBadRequest());
		verifyNoInteractions(writes);
	}

	private RequestPostProcessor identity() {
		return authentication(UsernamePasswordAuthenticationToken.authenticated(
			new AuthPrincipal(actor.toString(), UUID.randomUUID().toString()), null, List.of()));
	}

	@Test
	void acceptsAccountMatchingWithoutSeparateDateOrChangeReason() throws Exception {
		UUID expense = UUID.randomUUID(), account = UUID.randomUUID();
		mvc.perform(post("/api/properties/" + propertyId + "/accounting/expenses/" + expense + "/reviews")
			.with(identity()).contentType("application/json")
			.content("{\"accountId\":\"" + account + "\",\"expectedRevision\":0}"))
			.andExpect(status().isNoContent());
		verify(writes).reviewExpense(eq(actor), eq(propertyId), eq(expense), argThat(request ->
			request.accountId().equals(account) && request.recognitionMonth() == null && request.reason() == null));
	}

	@TestConfiguration
	static class Security {
		@Bean
		SecurityFilterChain filter(HttpSecurity http) throws Exception {
			return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
				.exceptionHandling(error -> error.authenticationEntryPoint((request, response, exception) -> response.setStatus(401))).build();
		}
	}
}
