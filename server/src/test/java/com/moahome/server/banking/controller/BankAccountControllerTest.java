package com.moahome.server.banking.controller;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.banking.dto.BankAccountSettings;
import com.moahome.server.banking.service.BankAccountService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(BankAccountController.class)
@ActiveProfiles("test")
@Import(BankAccountControllerTest.Security.class)
class BankAccountControllerTest {
	@Autowired
	MockMvc mvc;

	@MockitoBean
	BankAccountService service;

	UUID user = UUID.randomUUID(), property = UUID.randomUUID(), account = UUID.randomUUID();

	String base() {
		return "/api/properties/" + property + "/banking/account";
	}

	RequestPostProcessor identity() {
		return authentication(UsernamePasswordAuthenticationToken
		    .authenticated(new AuthPrincipal(user.toString(), UUID.randomUUID().toString()), null, List.of()));
	}

	@Test
	void authenticatesAndPreventsCachingOfAccountDetails() throws Exception {
		mvc.perform(get(base())).andExpect(status().isUnauthorized());
		var response = new BankAccountSettings.Response(property, account, OffsetDateTime.parse("2026-10-18T00:00:00Z"),
		    "004", "국민은행", "00012345678", "예시 예금주");
		when(service.read(user, property)).thenReturn(response);
		mvc.perform(get(base()).with(identity())).andExpect(status().isOk())
		    .andExpect(header().string("Cache-Control", "no-store"))
		    .andExpect(jsonPath("$.accountNumber").value("00012345678"));
		assertThat(response.toString()).doesNotContain("00012345678", "예시 예금주");
	}

	@Test
	void validatesVersionAndNumberBeforeCallingService() throws Exception {
		mvc.perform(put(base()).with(identity()).contentType(MediaType.APPLICATION_JSON).content("{}"))
		    .andExpect(status().isBadRequest());
		mvc.perform(put(base()).with(identity()).contentType(MediaType.APPLICATION_JSON).content(body("잘못된 번호")))
		    .andExpect(status().isBadRequest());
		verifyNoInteractions(service);
		mvc.perform(put(base()).with(identity()).contentType(MediaType.APPLICATION_JSON).content(body("000-1234-5678")))
		    .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
		verify(service).correct(eq(user), eq(property), argThat(
		    request -> request.accountNumber().equals("00012345678") && !request.toString().contains("00012345678")));
	}

	@Test
	void returnsAccessFailureWithoutAccountDetails() throws Exception {
		when(service.read(user, property)).thenThrow(new AuthException(AuthErrorCode.ACCESS_DENIED));
		mvc.perform(get(base()).with(identity())).andExpect(status().isForbidden())
		    .andExpect(jsonPath("$.code").value("ACCESS_DENIED")).andExpect(jsonPath("$.accountNumber").doesNotExist());
	}

	@Test
	void selectedDetailIsMaskedAndNumberRequiresSeparateAuthenticatedPost() throws Exception {
		var at = OffsetDateTime.parse("2026-10-18T00:00:00Z");
		when(service.detail(user, property, account)).thenReturn(new BankAccountSettings.Detail(property, account, at,
		    "004", "국민은행", "5678", "예시 예금주", "관리비", true, "ACTIVE"));
		when(service.revealNumber(user, property, account))
		    .thenReturn(new BankAccountSettings.RevealedNumber(property, account, at, "00012345678"));
		mvc.perform(get(base() + "/" + account)).andExpect(status().isUnauthorized());
		mvc.perform(post(base() + "/" + account + "/number-reveal")).andExpect(status().isUnauthorized());
		mvc.perform(get(base() + "/" + account).with(identity())).andExpect(status().isOk())
		    .andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("$.last4").value("5678"))
		    .andExpect(jsonPath("$.accountNumber").doesNotExist())
		    .andExpect(jsonPath("$.accountNumberEncrypted").doesNotExist());
		mvc.perform(post(base() + "/" + account + "/number-reveal").with(identity())).andExpect(status().isOk())
		    .andExpect(header().string("Cache-Control", "no-store"))
		    .andExpect(jsonPath("$.accountId").value(account.toString()))
		    .andExpect(jsonPath("$.accountNumber").value("00012345678"));
		assertThat(new BankAccountSettings.RevealedNumber(property, account, at, "00012345678").toString())
		    .doesNotContain("00012345678");
	}

	String body(String number) {
		return "{\"accountId\":\"" + account
		    + "\",\"updatedAt\":\"2026-10-18T00:00:00Z\",\"bankCode\":\"004\",\"bankName\":\"국민은행\",\"accountNumber\":\""
		    + number + "\",\"holderName\":\"예시 예금주\"}";
	}

	@TestConfiguration
	static class Security {
		@Bean
		SecurityFilterChain testSecurity(HttpSecurity http) throws Exception {
			return http.csrf(c -> c.disable()).authorizeHttpRequests(a -> a.anyRequest().authenticated())
			    .exceptionHandling(
			        e -> e.authenticationEntryPoint((request, response, error) -> response.setStatus(401)))
			    .build();
		}
	}
}
