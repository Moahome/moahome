package com.moahome.server.resident.controller;

import java.util.*;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.resident.dto.*;
import com.moahome.server.resident.exception.ResidentRegistrationException;
import com.moahome.server.resident.service.ResidentRegistrationService;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ResidentRegistrationController.class)
@ActiveProfiles("test")
@Import(ResidentListControllerTest.Security.class)
class ResidentRegistrationControllerTest {
	@Autowired
	MockMvc mvc;

	@MockitoBean
	ResidentRegistrationService service;

	private final UUID actor = UUID.randomUUID();

	private final UUID propertyId = UUID.randomUUID();

	private final UUID unitId = UUID.randomUUID();

	private final UUID requestId = UUID.randomUUID();

	private final String url = "/api/properties/" + propertyId + "/residents";

	private RequestPostProcessor identity() {
		return authentication(UsernamePasswordAuthenticationToken
		    .authenticated(new AuthPrincipal(actor.toString(), UUID.randomUUID().toString()), null, List.of()));
	}

	private String input(String name, String phone, String relation) {
		return """
            {"requestId":"%s","name":"%s","phone":%s,"unitId":"%s","relationType":"%s"}
            """.formatted(requestId, name, phone, unitId, relation);
	}

	@Test
	void registersWithoutPhoneAndReturnsSafeNoStoreResult() throws Exception {
		when(service.register(eq(actor), eq(propertyId), any()))
		    .thenReturn(new ResidentRegistrationResponse(requestId, propertyId, unitId, true));
		mvc.perform(
		    post(url).with(identity()).contentType(MediaType.APPLICATION_JSON).content(input("주민", "null", "TENANT")))
		    .andExpect(status().isCreated()).andExpect(header().string("Cache-Control", "no-store"))
		    .andExpect(jsonPath("id").value(requestId.toString())).andExpect(jsonPath("representative").value(true))
		    .andExpect(jsonPath("phone").doesNotExist()).andExpect(jsonPath("phoneEncrypted").doesNotExist());
		verify(service).register(eq(actor), eq(propertyId),
		    argThat(request -> request.phone() == null && request.name().equals("주민")));
	}

	@Test
	void defaultsOmittedNullOrBlankRelationToOther() throws Exception {
		when(service.register(eq(actor), eq(propertyId), any()))
		    .thenReturn(new ResidentRegistrationResponse(requestId, propertyId, unitId, true));
		for (String relation : List.of("", ",\"relationType\":null", ",\"relationType\":\"  \"")) {
			String body = "{\"requestId\":\"%s\",\"name\":\"주민\",\"unitId\":\"%s\"%s}".formatted(requestId, unitId,
			    relation);
			mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON).content(body))
			    .andExpect(status().isCreated());
		}
		verify(service, times(3)).register(eq(actor), eq(propertyId),
		    argThat(request -> request.relationType().equals("OTHER")));
	}

	@Test
	void requiresAuthenticationAndValidatesBodyWithoutLeakingInput() throws Exception {
		mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content(input("주민", "null", "TENANT")))
		    .andExpect(status().isUnauthorized());
		for (String body : List.of("{}", input("  ", "null", "TENANT"), input("주민", "null", "ADMIN"), "{broken")) {
			mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON).content(body))
			    .andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("INVALID_REQUEST"));
		}
		mvc.perform(post("/api/properties/1-1-1-1-1/residents").with(identity()).contentType(MediaType.APPLICATION_JSON)
		    .content(input("주민", "null", "TENANT"))).andExpect(status().isBadRequest());
		verifyNoInteractions(service);
	}

	@Test
	void returnsDistinctDuplicateAndUnavailableErrors() throws Exception {
		for (var code : List.of(ResidentRegistrationException.Code.DUPLICATE_RESIDENT,
		    ResidentRegistrationException.Code.PHONE_SECURITY_UNAVAILABLE)) {
			when(service.register(eq(actor), eq(propertyId), any())).thenThrow(new ResidentRegistrationException(code));
			mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON)
			    .content(input("주민", "null", "FAMILY"))).andExpect(status().is(code.status.value()))
			    .andExpect(jsonPath("code").value(code.name())).andExpect(header().string("Cache-Control", "no-store"));
		}
	}
}
