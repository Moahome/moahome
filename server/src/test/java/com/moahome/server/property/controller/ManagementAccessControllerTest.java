package com.moahome.server.property.controller;

import java.util.List;
import java.util.UUID;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.dto.ManagedPropertiesResponse;
import com.moahome.server.property.dto.ManagementPropertyResponse;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.user.exception.UserErrorCode;
import com.moahome.server.user.exception.UserException;
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
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ManagementAccessController.class)
@ActiveProfiles("test")
@Import(ManagementAccessControllerTest.Security.class)
class ManagementAccessControllerTest {
	private static final UUID USER_ID = UUID.randomUUID();

	private static final UUID PROPERTY_ID = UUID.randomUUID();

	private static final String LIST = "/api/users/me/managed-properties";

	private static final String CONTEXT = "/api/properties/" + PROPERTY_ID + "/management-context";

	@Autowired
	MockMvc mvc;

	@MockitoBean
	ManagementAccessService management;

	private org.springframework.test.web.servlet.request.RequestPostProcessor identity() {
		return authentication(UsernamePasswordAuthenticationToken
		    .authenticated(new AuthPrincipal(USER_ID.toString(), UUID.randomUUID().toString()), null, List.of()));
	}

	@Test
	void usesBearerIdentityAndReturnsOnlyMinimalCurrentFieldsWithoutCaching() throws Exception {
		var property = new ManagementPropertyResponse(PROPERTY_ID, "관리대상", PropertyMemberRole.MANAGER);
		when(management.getManagedProperties(USER_ID)).thenReturn(new ManagedPropertiesResponse(List.of(property)));
		when(management.getManagementContext(USER_ID, PROPERTY_ID)).thenReturn(property);
		mvc.perform(get(LIST).with(identity()).param("userId", UUID.randomUUID().toString()).param("role", "ADMIN"))
		    .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
		    .andExpect(jsonPath("properties[0].propertyId").value(PROPERTY_ID.toString()))
		    .andExpect(jsonPath("properties[0].role").value("MANAGER"))
		    .andExpect(jsonPath("properties[0].length()").value(3));
		mvc.perform(get(CONTEXT).with(identity())).andExpect(status().isOk())
		    .andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("$.length()").value(3));
		verify(management).getManagedProperties(USER_ID);
		verify(management).getManagementContext(USER_ID, PROPERTY_ID);
	}

	@Test
	void noBearerAndMalformedUuidCannotReachService() throws Exception {
		mvc.perform(get(LIST)).andExpect(status().isUnauthorized());
		mvc.perform(get(CONTEXT)).andExpect(status().isUnauthorized());
		for (String id : List.of("invalid", "1-1-1-1-1")) {
			mvc.perform(get("/api/properties/" + id + "/management-context").with(identity()))
			    .andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("INVALID_REQUEST"));
		}
		verifyNoInteractions(management);
	}

	@Test
	void mapsCurrentAccessAccountAndStorageErrorsWithoutLeakingInternalDetails() throws Exception {
		doThrow(new AuthException(AuthErrorCode.ACCESS_DENIED)).when(management).getManagementContext(USER_ID,
		    PROPERTY_ID);
		mvc.perform(get(CONTEXT).with(identity())).andExpect(status().isForbidden())
		    .andExpect(jsonPath("code").value("ACCESS_DENIED"));
		doThrow(new UserException(UserErrorCode.USER_NOT_FOUND)).when(management).getManagedProperties(USER_ID);
		mvc.perform(get(LIST).with(identity())).andExpect(status().isForbidden())
		    .andExpect(jsonPath("code").value("ACCOUNT_UNAVAILABLE"));
		doThrow(new AuthException(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE)).when(management)
		    .getManagedProperties(USER_ID);
		mvc.perform(get(LIST).with(identity())).andExpect(status().isServiceUnavailable());
		doThrow(new IllegalStateException("private SQL account")).when(management).getManagedProperties(USER_ID);
		mvc.perform(get(LIST).with(identity())).andExpect(status().isInternalServerError())
		    .andExpect(header().string("Cache-Control", "no-store"))
		    .andExpect(jsonPath("code").value("INTERNAL_SERVER_ERROR"))
		    .andExpect(jsonPath("message").value("요청을 처리하지 못했습니다."));
	}

	@TestConfiguration
	static class Security {
		@Bean
		SecurityFilterChain testSecurity(HttpSecurity http) throws Exception {
			return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
			    .exceptionHandling(errors -> errors
			        .authenticationEntryPoint((request, response, exception) -> response.setStatus(401)))
			    .build();
		}
	}
}
