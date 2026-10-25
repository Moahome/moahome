package com.moahome.server.banking.controller;

import java.util.*;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.banking.service.BankBalanceCheckService;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(BankBalanceCheckController.class)
@ActiveProfiles("test")
@Import(BankBalanceCheckControllerTest.Security.class)
class BankBalanceCheckControllerTest {
	@Autowired
	MockMvc mvc;

	@MockitoBean
	BankBalanceCheckService service;

	UUID user = UUID.randomUUID(), property = UUID.randomUUID();

	String base() {
		return "/api/properties/" + property + "/banking/balances/checks";
	}

	RequestPostProcessor identity() {
		return authentication(UsernamePasswordAuthenticationToken
		    .authenticated(new AuthPrincipal(user.toString(), UUID.randomUUID().toString()), null, List.of()));
	}

	@Test
	void protectsHistoryAndValidatesObservationInputs() throws Exception {
		mvc.perform(get(base()).param("accountId", UUID.randomUUID().toString())).andExpect(status().isUnauthorized());
		UUID account = UUID.randomUUID();
		mvc.perform(get(base()).param("accountId", account.toString()).with(identity())).andExpect(status().isOk())
		    .andExpect(header().string("Cache-Control", "no-store"));
		verify(service).history(user, property, account);
		mvc.perform(post(base()).with(identity()).contentType(MediaType.APPLICATION_JSON).content("{}"))
		    .andExpect(status().isBadRequest());
		mvc.perform(post(base() + "/" + UUID.randomUUID() + "/cancel").with(identity())
		    .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
		verifyNoMoreInteractions(service);
	}

	@TestConfiguration
	static class Security {
		@Bean
		SecurityFilterChain testSecurity(HttpSecurity http) throws Exception {
			return http.csrf(c -> c.disable()).authorizeHttpRequests(a -> a.anyRequest().authenticated())
			    .exceptionHandling(e -> e.authenticationEntryPoint((r, s, x) -> s.setStatus(401))).build();
		}
	}
}
