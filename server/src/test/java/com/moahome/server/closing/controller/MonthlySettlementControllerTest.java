package com.moahome.server.closing.controller;

import java.util.List;
import java.util.UUID;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.closing.service.MonthlySettlementService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(MonthlySettlementController.class)
@ActiveProfiles("test")
@Import(MonthlySettlementControllerTest.Security.class)
class MonthlySettlementControllerTest {
	@Autowired
	MockMvc mvc;
	@MockitoBean
	MonthlySettlementService service;
	private final UUID user = UUID.randomUUID(), property = UUID.randomUUID();

	@Test
	void requiresAuthenticationAndNeverCachesFinancialResponses() throws Exception {
		String url = "/api/properties/" + property + "/closing/monthly";
		mvc.perform(get(url)).andExpect(status().isUnauthorized());
		verifyNoInteractions(service);
		var identity = authentication(UsernamePasswordAuthenticationToken.authenticated(
			new AuthPrincipal(user.toString(), UUID.randomUUID().toString()), null, List.of()));
		mvc.perform(get(url).param("month", "2026-10").with(identity)).andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", "no-store"));
		verify(service).get(user, property, "2026-10");
		when(service.get(user, property, "2026-10")).thenThrow(new AuthException(AuthErrorCode.ACCESS_DENIED));
		mvc.perform(get(url).param("month", "2026-10").with(identity)).andExpect(status().isForbidden());
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
