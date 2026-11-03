package com.moahome.server.systemadmin.controller;

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
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.systemadmin.dto.SystemAdminResponse;
import com.moahome.server.systemadmin.service.SystemAdminService;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(SystemAdminController.class)
@ActiveProfiles("test")
@Import(SystemAdminControllerTest.Security.class)
class SystemAdminControllerTest {
	private static final UUID ACTOR = UUID.randomUUID();
	private static final UUID TARGET = UUID.randomUUID();
	private static final String PATH = "/api/system-admin/users";
	@Autowired
	MockMvc mvc;
	@MockitoBean
	SystemAdminService service;

	private RequestPostProcessor identity() {
		return authentication(UsernamePasswordAuthenticationToken.authenticated(
		    new AuthPrincipal(ACTOR.toString(), UUID.randomUUID().toString()), null, List.of()));
	}

	@Test
	void authenticatedListUsesPrincipalAndDisablesCaching() throws Exception {
		when(service.list(ACTOR, "", false, 1, 20)).thenReturn(new SystemAdminResponse.Members(List.of(), 1, 20, 0, 1));
		mvc.perform(get(PATH).with(identity())).andExpect(status().isOk())
		    .andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("total").value(0));
		verify(service).list(ACTOR, "", false, 1, 20);
	}

	@Test
	void missingPermissionFieldsAndUnboundedPaginationNeverReachService() throws Exception {
		mvc.perform(post(PATH + "/" + TARGET + "/creation-permission").with(identity())
		    .contentType(MediaType.APPLICATION_JSON).content("{\"requestId\":\"" + UUID.randomUUID() + "\",\"allowed\":true}"))
		    .andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("INVALID_ADMIN_REQUEST"));
		mvc.perform(get(PATH + "?page=0&size=101").with(identity())).andExpect(status().isBadRequest());
		verifyNoInteractions(service);
	}

	@Test
	void missingAuthenticationAndOrdinaryUserAreRejected() throws Exception {
		mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
		when(service.get(ACTOR, TARGET)).thenThrow(new AuthException(AuthErrorCode.ACCESS_DENIED));
		mvc.perform(get(PATH + "/" + TARGET).with(identity())).andExpect(status().isForbidden())
		    .andExpect(jsonPath("code").value("ACCESS_DENIED"));
	}

	@TestConfiguration
	static class Security {
		@Bean
		SecurityFilterChain testSecurity(HttpSecurity http) throws Exception {
			return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
			    .exceptionHandling(errors -> errors.authenticationEntryPoint((request, response, exception) -> response.setStatus(401)))
			    .build();
		}
	}
}
