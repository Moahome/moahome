package com.moahome.server.membership.controller;

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
import com.moahome.server.membership.dto.MemberRequests;
import com.moahome.server.membership.service.MemberManagementService;
import com.moahome.server.payment.exception.PaymentException;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(MemberManagementController.class)
@ActiveProfiles("test")
@Import(MemberLeaveControllerTest.Security.class)
class MemberLeaveControllerTest {
	@Autowired
	MockMvc mvc;

	@MockitoBean
	MemberManagementService service;

	private final UUID actor = UUID.randomUUID();

	private final UUID property = UUID.randomUUID();

	private final String url = "/api/properties/" + property + "/members/me/leave";

	private RequestPostProcessor identity() {
		return authentication(UsernamePasswordAuthenticationToken.authenticated(
		    new AuthPrincipal(actor.toString(), UUID.randomUUID().toString()), null, List.of()));
	}

	@Test
	void usesAuthenticatedSelfForBothReasonsAndDisablesResponseCaching() throws Exception {
		for (var reason : MemberRequests.LeaveReason.values()) {
			mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON)
			    .content("{\"reason\":\"" + reason + "\"}"))
			    .andExpect(status().isNoContent()).andExpect(header().string("Cache-Control", "no-store"));
			verify(service).leave(actor, property, new MemberRequests.Leave(reason));
		}
	}

	@Test
	void rejectsUnauthenticatedMissingUnknownAndInjectedIdentityBeforeCallingService() throws Exception {
		mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"SERVICE_ONLY\"}"))
		    .andExpect(status().isUnauthorized());
		for (String body : List.of("{}", "{\"reason\":null}", "{\"reason\":\"DELETE_ALL\"}",
		    "{\"reason\":\"SERVICE_ONLY\",\"userId\":\"" + UUID.randomUUID() + "\"}")) {
			mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON).content(body))
			    .andExpect(status().isBadRequest());
		}
		verifyNoInteractions(service);
	}

	@Test
	void returnsActionableTransferAndRepresentativeConflicts() throws Exception {
		for (String code : List.of("MEMBER_TRANSFER_REQUIRED", "MEMBER_REPRESENTATIVE_REQUIRED")) {
			doThrow(new PaymentException(code)).when(service).leave(eq(actor), eq(property), any());
			mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON)
			    .content("{\"reason\":\"MOVE_OUT\"}"))
			    .andExpect(status().isConflict()).andExpect(jsonPath("code").value(code))
			    .andExpect(header().string("Cache-Control", "no-store"));
		}
	}

	@TestConfiguration
	static class Security {
		@Bean
		SecurityFilterChain chain(HttpSecurity http) throws Exception {
			return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(r -> r.anyRequest().authenticated())
			    .exceptionHandling(e -> e.authenticationEntryPoint((req, res, ex) -> res.setStatus(401))).build();
		}
	}
}
