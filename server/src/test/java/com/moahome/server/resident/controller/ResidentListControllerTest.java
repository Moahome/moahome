package com.moahome.server.resident.controller;

import java.util.*;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.auth.exception.*;
import com.moahome.server.resident.domain.ResidentSignupStatus;
import com.moahome.server.resident.dto.ResidentListResponse;
import com.moahome.server.resident.dto.ResidentListResponse.ResidentItem;
import com.moahome.server.resident.service.ResidentListService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.*;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ResidentListController.class)
@ActiveProfiles("test")
@Import(ResidentListControllerTest.Security.class)
class ResidentListControllerTest {
	@Autowired MockMvc mvc;
	@MockitoBean ResidentListService service;
	private final UUID userId = UUID.randomUUID();
	private final UUID propertyId = UUID.randomUUID();
	private final String url = "/api/properties/" + propertyId + "/residents";

	private org.springframework.test.web.servlet.request.RequestPostProcessor identity() {
		return authentication(UsernamePasswordAuthenticationToken.authenticated(
			new AuthPrincipal(userId.toString(), UUID.randomUUID().toString()), null, List.of()));
	}

	@Test
	void authenticatesAndRejectsMalformedPropertyBeforeService() throws Exception {
		mvc.perform(get(url)).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/properties/1-1-1-1-1/residents").with(identity()))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("INVALID_REQUEST"));
		verifyNoInteractions(service);
	}

	@Test
	void returnsOnlyLastFourDigitsAndNeverAccountIdOrPrivatePhoneFields() throws Exception {
		var residentId = UUID.randomUUID();
		when(service.list(userId, propertyId)).thenReturn(new ResidentListResponse(propertyId, false, List.of(),
			List.of(new ResidentItem(residentId, "주민", "1234", null, null, null, null, false, ResidentSignupStatus.NOT_JOINED))));
		mvc.perform(get(url).with(identity())).andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", "no-store"))
			.andExpect(jsonPath("residents[0].phoneLast4").value("1234"))
			.andExpect(jsonPath("residents[0].signupStatus").value("NOT_JOINED"))
			.andExpect(jsonPath("residents[0].accountLinked").doesNotExist())
			.andExpect(jsonPath("residents[0].phone").doesNotExist())
			.andExpect(jsonPath("residents[0].phoneEncrypted").doesNotExist())
			.andExpect(jsonPath("residents[0].phoneHmac").doesNotExist())
			.andExpect(jsonPath("residents[0].userId").doesNotExist());
		verify(service).list(userId, propertyId);
	}

	@Test
	void separatesForbiddenStorageFailureAndUnexpectedFailureFromEmptyDirectory() throws Exception {
		when(service.list(userId, propertyId)).thenThrow(new AuthException(AuthErrorCode.ACCESS_DENIED));
		mvc.perform(get(url).with(identity())).andExpect(status().isForbidden()).andExpect(jsonPath("code").value("ACCESS_DENIED"));
		doThrow(new DataAccessResourceFailureException("private SQL")).when(service).list(userId, propertyId);
		mvc.perform(get(url).with(identity())).andExpect(status().isServiceUnavailable())
			.andExpect(header().string("Cache-Control", "no-store"))
			.andExpect(jsonPath("code").value("RESIDENT_SERVICE_UNAVAILABLE"));
		doThrow(new IllegalStateException("private data")).when(service).list(userId, propertyId);
		mvc.perform(get(url).with(identity())).andExpect(status().isInternalServerError())
			.andExpect(jsonPath("message").value("요청을 처리하지 못했습니다."));
	}

	@TestConfiguration
	static class Security {
		@Bean SecurityFilterChain testSecurity(HttpSecurity http) throws Exception {
			return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
				.exceptionHandling(errors -> errors.authenticationEntryPoint((request, response, exception) -> response.setStatus(401))).build();
		}
	}
}
