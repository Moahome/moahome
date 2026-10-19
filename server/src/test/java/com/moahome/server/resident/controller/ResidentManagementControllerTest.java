package com.moahome.server.resident.controller;

import java.time.OffsetDateTime;
import java.util.*;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.resident.dto.*;
import com.moahome.server.resident.domain.ResidentSignupStatus;
import com.moahome.server.resident.service.ResidentManagementService;
import com.moahome.server.resident.exception.ResidentRegistrationException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ResidentManagementController.class)
@ActiveProfiles("test")
@Import(ResidentListControllerTest.Security.class)
class ResidentManagementControllerTest {
	@Autowired
	MockMvc mvc;

	@MockitoBean
	ResidentManagementService service;

	private final UUID actor = UUID.randomUUID(), propertyId = UUID.randomUUID(), residentId = UUID.randomUUID(),
	    unitId = UUID.randomUUID();

	private final OffsetDateTime at = OffsetDateTime.parse("2026-10-10T04:00:00Z");

	private final String url = "/api/properties/" + propertyId + "/residents/" + residentId;

	private org.springframework.test.web.servlet.request.RequestPostProcessor identity() {
		return authentication(UsernamePasswordAuthenticationToken
		    .authenticated(new AuthPrincipal(actor.toString(), UUID.randomUUID().toString()), null, List.of()));
	}

	@Test
	void detailMasksUntilExplicitRevealAndBothResponsesDisableCaching() throws Exception {
		when(service.detail(actor, propertyId, residentId))
		    .thenReturn(new ResidentDetailResponse(residentId, propertyId, "조회 주민", "5678", unitId, null, null, "301",
		        "TENANT", true, ResidentSignupStatus.NOT_JOINED, at, at, false, List.of()));
		mvc.perform(get(url).with(identity())).andExpect(status().isOk())
		    .andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("phoneLast4").value("5678"))
		    .andExpect(jsonPath("phone").doesNotExist()).andExpect(jsonPath("phoneEncrypted").doesNotExist())
		    .andExpect(jsonPath("phoneHmac").doesNotExist()).andExpect(jsonPath("userId").doesNotExist());
		verify(service, never()).revealPhone(any(), any(), any());
		when(service.revealPhone(actor, propertyId, residentId)).thenReturn("+821012345678");
		mvc.perform(post(url + "/phone-reveal").with(identity())).andExpect(status().isOk())
		    .andExpect(header().string("Cache-Control", "no-store"))
		    .andExpect(jsonPath("phone").value("+821012345678"));
	}

	@Test
	void requiresAuthenticationAndStrictIdsAndValidatedUpdateOrDeleteBody() throws Exception {
		mvc.perform(get(url)).andExpect(status().isUnauthorized());
		mvc.perform(post(url + "/phone-reveal")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/properties/1-1-1-1-1/residents/" + residentId).with(identity()))
		    .andExpect(status().isBadRequest());
		mvc.perform(get("/api/properties/" + propertyId + "/residents/1-1-1-1-1").with(identity()))
		    .andExpect(status().isBadRequest());
		for (String body : List.of("{}", "{broken", """
            {"name":"주민","unitId":"%s","relationType":"ADMIN","phoneAction":"KEEP","expectedUpdatedAt":"%s"}
            """.formatted(unitId, at))) {
			mvc.perform(put(url).with(identity()).contentType(MediaType.APPLICATION_JSON).content(body))
			    .andExpect(status().isBadRequest());
		}
		mvc.perform(delete(url).with(identity()).contentType(MediaType.APPLICATION_JSON).content("{}"))
		    .andExpect(status().isBadRequest());
		verifyNoInteractions(service);
	}

	@Test
	void deletionUsesSelectedRepresentativeAndReturnsNoContentWhileConflictsAndKeyErrorsRemainSafe() throws Exception {
		var selected = UUID.randomUUID();
		mvc.perform(delete(url).with(identity()).contentType(MediaType.APPLICATION_JSON)
		    .content("{\"replacementResidentId\":\"%s\",\"expectedUpdatedAt\":\"%s\"}".formatted(selected, at)))
		    .andExpect(status().isNoContent()).andExpect(header().string("Cache-Control", "no-store"));
		verify(service).delete(eq(actor), eq(propertyId), eq(residentId),
		    argThat(input -> selected.equals(input.replacementResidentId()) && input.expectedUpdatedAt().isEqual(at)));
		when(service.revealPhone(actor, propertyId, residentId)).thenThrow(
		    new ResidentRegistrationException(ResidentRegistrationException.Code.PHONE_SECURITY_UNAVAILABLE));
		mvc.perform(post(url + "/phone-reveal").with(identity())).andExpect(status().isServiceUnavailable())
		    .andExpect(jsonPath("code").value("PHONE_SECURITY_UNAVAILABLE"))
		    .andExpect(jsonPath("phone").doesNotExist());
	}
}
