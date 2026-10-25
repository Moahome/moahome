package com.moahome.server.billing.controller;

import java.time.*;
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
import com.moahome.server.auth.exception.*;
import com.moahome.server.billing.dto.*;
import com.moahome.server.billing.exception.BillingException;
import com.moahome.server.billing.service.BillingService;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(BillingController.class)
@ActiveProfiles("test")
@Import(BillingControllerTest.Security.class)
class BillingControllerTest {
	private final UUID userId = UUID.randomUUID();

	private final UUID propertyId = UUID.randomUUID();

	private final UUID revision = UUID.randomUUID();

	private final String url = "/api/properties/" + propertyId + "/billing";

	@Autowired
	MockMvc mvc;

	@MockitoBean
	BillingService service;

	private RequestPostProcessor identity() {
		return authentication(UsernamePasswordAuthenticationToken
		    .authenticated(new AuthPrincipal(userId.toString(), UUID.randomUUID().toString()), null, List.of()));
	}

	@Test
	void protectsAllEndpointsAndValidatesMonthIdentifiersAndNestedInputs() throws Exception {
		for (String path : List.of("/settings", "/history", "/monthly/2026-10",
		    "/monthly/2026-10/units/" + UUID.randomUUID())) {
			mvc.perform(get(url + path)).andExpect(status().isUnauthorized());
		}
		mvc.perform(put(url + "/settings").contentType(MediaType.APPLICATION_JSON).content("{}"))
		    .andExpect(status().isUnauthorized());
		for (String month : List.of("2026-13", "2026-1", "0000-01", "invalid")) {
			mvc.perform(get(url + "/monthly/" + month).with(identity())).andExpect(status().isBadRequest());
		}
		for (String reason : List.of("null", "\" \"", "\"" + "가".repeat(1001) + "\"")) {
			mvc.perform(put(url + "/settings").with(identity()).contentType(MediaType.APPLICATION_JSON)
			    .content(body(reason, "[{\"itemName\":\"항목\",\"defaultAmount\":0}]")))
			    .andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("INVALID_REQUEST"));
		}
		for (String items : List.of("[]", "[null]", "[{\"itemName\":\" \",\"defaultAmount\":0}]",
		    "[{\"itemName\":\"항목\",\"defaultAmount\":1000000000000000}]",
		    "[{\"itemName\":\"항목\",\"defaultAmount\":1.5}]", "[{\"itemName\":\"항목\",\"defaultAmount\":\"1000\"}]",
		    "[{\"itemName\":\"항목\",\"itemCode\":\"INVALID\",\"defaultAmount\":1}]")) {
			mvc.perform(put(url + "/settings").with(identity()).contentType(MediaType.APPLICATION_JSON)
			    .content(body("\"사유\"", items))).andExpect(status().isBadRequest());
		}
		verifyNoInteractions(service);
	}

	@Test
	void cancellationValidatesAuthenticationScopeAndReturnsNoContentForSameCharge() throws Exception {
		var chargeId = UUID.randomUUID();
		var path = url + "/monthly/2026-10/charges/" + chargeId;
		mvc.perform(delete(path)).andExpect(status().isUnauthorized());
		mvc.perform(delete(url + "/monthly/2026-13/charges/" + chargeId).with(identity()))
		    .andExpect(status().isBadRequest());
		mvc.perform(delete(url + "/monthly/2026-10/charges/invalid").with(identity()))
		    .andExpect(status().isBadRequest());
		verifyNoInteractions(service);
		mvc.perform(delete(path).with(identity())).andExpect(status().isNoContent())
		    .andExpect(header().string("Cache-Control", "no-store"));
		verify(service).cancelCharge(userId, propertyId, YearMonth.of(2026, 10), chargeId);
		doThrow(new BillingException(BillingException.Code.BILLING_CANCELLATION_NOT_ALLOWED)).when(service)
		    .cancelCharge(userId, propertyId, YearMonth.of(2026, 10), chargeId);
		mvc.perform(delete(path).with(identity())).andExpect(status().isConflict())
		    .andExpect(jsonPath("code").value("BILLING_CANCELLATION_NOT_ALLOWED"));
	}

	@Test
	void usesAuthenticatedIdentityForSignedSaveAndScopedMonthlyReads() throws Exception {
		when(service.monthly(userId, propertyId, YearMonth.of(2028, 2)))
		    .thenReturn(new BillingResponse.Month(propertyId, false, "2028-02", LocalDate.of(2028, 2, 1),
		        LocalDate.of(2028, 2, 29), "ISSUED", "-1", List.of()));
		mvc.perform(get(url + "/monthly/2028-02").with(identity())).andExpect(status().isOk())
		    .andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("dueDate").value("2028-02-29"))
		    .andExpect(jsonPath("baseAmount").value("-1"));
		mvc.perform(put(url + "/settings").with(identity()).contentType(MediaType.APPLICATION_JSON)
		    .content(body("\" 필수 사유 \"",
		        "[{\"itemName\":\" 차감 \",\"defaultAmount\":-1},{\"itemName\":\"영\",\"defaultAmount\":0}]")))
		    .andExpect(status().isOk());
		verify(service).saveSettings(eq(userId), eq(propertyId),
		    argThat(request -> request.revisionId().equals(revision) && request.reason().equals("필수 사유")
		        && request.items().getFirst().defaultAmount() == -1L && request.items().get(1).defaultAmount() == 0L));
	}

	@Test
	void exposesConflictsAccessAndFailuresWithoutPrivateDetails() throws Exception {
		when(service.settings(userId, propertyId)).thenThrow(new AuthException(AuthErrorCode.ACCESS_DENIED));
		mvc.perform(get(url + "/settings").with(identity())).andExpect(status().isForbidden());
		doThrow(new BillingException(BillingException.Code.BILLING_SETTINGS_CONFLICT)).when(service).settings(userId,
		    propertyId);
		mvc.perform(get(url + "/settings").with(identity())).andExpect(status().isConflict())
		    .andExpect(jsonPath("code").value("BILLING_SETTINGS_CONFLICT"));
		doThrow(new IllegalStateException("private SQL")).when(service).settings(userId, propertyId);
		mvc.perform(get(url + "/settings").with(identity())).andExpect(status().isInternalServerError())
		    .andExpect(jsonPath("message").value("요청을 처리하지 못했습니다."));
	}

	private String body(String reason, String items) {
		return "{\"revisionId\":\"" + revision + "\",\"effectiveMonth\":\"2026-11\",\"reason\":" + reason
		    + ",\"items\":" + items + "}";
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
