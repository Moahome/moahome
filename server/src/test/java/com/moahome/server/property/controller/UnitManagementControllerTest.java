package com.moahome.server.property.controller;

import java.util.*;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.auth.exception.*;
import com.moahome.server.property.domain.UnitStatus;
import com.moahome.server.property.dto.*;
import com.moahome.server.property.service.UnitManagementService;
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
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(UnitManagementController.class)
@ActiveProfiles("test")
@Import(UnitManagementControllerTest.Security.class)
class UnitManagementControllerTest {
	private final UUID userId = UUID.randomUUID();
	private final UUID propertyId = UUID.randomUUID();
	private final UUID unitId = UUID.randomUUID();
	private final String url = "/api/properties/" + propertyId + "/units";
	@Autowired MockMvc mvc;
	@MockitoBean UnitManagementService service;

	private org.springframework.test.web.servlet.request.RequestPostProcessor identity() {
		return authentication(UsernamePasswordAuthenticationToken.authenticated(
			new AuthPrincipal(userId.toString(), UUID.randomUUID().toString()), null, List.of()));
	}

	@Test
	void authenticatesListAndValidatesEveryWriteBeforeService() throws Exception {
		mvc.perform(get(url)).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/properties/1-1-1-1-1/units").with(identity())).andExpect(status().isBadRequest());
		for (String body : List.of("{}", "{\"unitNumber\":\" \" ,\"status\":\"ACTIVE\"}",
			"{\"unitNumber\":\"001\",\"status\":\"INACTIVE\"}", "{\"unitNumber\":\"001\",\"floor\":32768,\"status\":\"ACTIVE\"}")) {
			mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("INVALID_REQUEST"));
			mvc.perform(put(url + "/" + unitId).with(identity()).contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isBadRequest());
		}
		verifyNoInteractions(service);
	}

	@Test
	void returnsDatabaseIdsAndUsesAuthenticatedIdentityForListCreateAndUpdate() throws Exception {
		var response = new UnitResponse(unitId, null, "001", null, (short) -1, UnitStatus.VACANT);
		when(service.list(userId, propertyId)).thenReturn(new UnitListResponse(propertyId, false, List.of(), List.of(response), null));
		when(service.create(eq(userId), eq(propertyId), any())).thenReturn(response);
		when(service.update(eq(userId), eq(propertyId), eq(unitId), any())).thenReturn(response);
		mvc.perform(get(url).with(identity())).andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", "no-store"))
			.andExpect(jsonPath("units[0].id").value(unitId.toString()));
		var body = "{\"unitNumber\":\"001\",\"floor\":-1,\"status\":\"VACANT\"}";
		mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON).content(body))
			.andExpect(status().isCreated()).andExpect(jsonPath("unitNumber").value("001"));
		mvc.perform(put(url + "/" + unitId).with(identity()).contentType(MediaType.APPLICATION_JSON).content(body))
			.andExpect(status().isOk()).andExpect(jsonPath("id").value(unitId.toString()));
		verify(service).create(eq(userId), eq(propertyId), any());
		verify(service).update(eq(userId), eq(propertyId), eq(unitId), any());
	}

	@Test
	void keepsAccessDenialAndStorageFailureSeparateFromEmptyList() throws Exception {
		when(service.list(userId, propertyId)).thenThrow(new AuthException(AuthErrorCode.ACCESS_DENIED));
		mvc.perform(get(url).with(identity())).andExpect(status().isForbidden()).andExpect(jsonPath("code").value("ACCESS_DENIED"));
		doThrow(new IllegalStateException("private SQL")).when(service).list(userId, propertyId);
		mvc.perform(get(url).with(identity())).andExpect(status().isInternalServerError())
			.andExpect(jsonPath("message").value("요청을 처리하지 못했습니다."));
	}

	@Test
	void batchAndBuildingRequestsRequireAuthenticationAndValidateNestedInputs() throws Exception {
		for (String path : List.of(url + "/batch", "/api/properties/" + propertyId + "/buildings")) {
			mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isUnauthorized());
		}
		for (String body : List.of("{}", "{\"units\":[]}", "{\"units\":[null]}",
			"{\"units\":[{\"unitNumber\":\"201\",\"status\":\"INACTIVE\"}]}")) {
			mvc.perform(post(url + "/batch").with(identity()).contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isBadRequest());
		}
		mvc.perform(post("/api/properties/" + propertyId + "/buildings").with(identity())
			.contentType(MediaType.APPLICATION_JSON).content("{\"name\":\" \"}"))
			.andExpect(status().isBadRequest());
		verifyNoInteractions(service);
	}

	@Test
	void batchAndBuildingWritesPassAuthenticatedScopeAndReturnDatabaseIds() throws Exception {
		var buildingId = UUID.randomUUID();
		when(service.createBuilding(eq(userId), eq(propertyId), any())).thenReturn(new UnitListResponse.BuildingItem(buildingId, "102동"));
		when(service.updateBuilding(eq(userId), eq(propertyId), eq(buildingId), any())).thenReturn(new UnitListResponse.BuildingItem(buildingId, "A동"));
		when(service.createBatch(eq(userId), eq(propertyId), any())).thenReturn(List.of(new UnitResponse(unitId, buildingId, "201", null, (short) 2, UnitStatus.ACTIVE)));
		var buildingsUrl = "/api/properties/" + propertyId + "/buildings";
		mvc.perform(post(buildingsUrl).with(identity()).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"102\"}"))
			.andExpect(status().isCreated()).andExpect(jsonPath("id").value(buildingId.toString()));
		mvc.perform(put(buildingsUrl + "/" + buildingId).with(identity()).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"A\"}"))
			.andExpect(status().isOk()).andExpect(jsonPath("id").value(buildingId.toString()));
		mvc.perform(post(url + "/batch").with(identity()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"units\":[{\"unitNumber\":\"201\",\"status\":\"ACTIVE\"}]}"))
			.andExpect(status().isCreated()).andExpect(header().string("Cache-Control", "no-store"))
			.andExpect(jsonPath("[0].id").value(unitId.toString()));
	}

	@Test
	void deletionRequiresAuthenticationAndValidatesTheWholeSelection() throws Exception {
		for (String path : List.of(url, url + "/" + unitId, "/api/properties/" + propertyId + "/buildings/" + unitId)) {
			mvc.perform(delete(path)).andExpect(status().isUnauthorized());
		}
		for (String body : List.of("{}", "{\"unitIds\":[]}", "{\"unitIds\":[null]}", "{\"unitIds\":[\"invalid\"]}")) {
			mvc.perform(delete(url).with(identity()).contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isBadRequest());
		}
		verifyNoInteractions(service);
	}

	@Test
	void deletesSingleSelectionAndBuildingWithAuthenticatedScopeAndNoContent() throws Exception {
		mvc.perform(delete(url + "/" + unitId).with(identity()))
			.andExpect(status().isNoContent()).andExpect(header().string("Cache-Control", "no-store"))
			.andExpect(content().string(""));
		verify(service).deleteUnits(userId, propertyId, List.of(unitId));
		var second = UUID.randomUUID();
		mvc.perform(delete(url).with(identity()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"unitIds\":[\"" + unitId + "\",\"" + second + "\"]}"))
			.andExpect(status().isNoContent());
		verify(service).deleteUnits(userId, propertyId, List.of(unitId, second));
		mvc.perform(delete("/api/properties/" + propertyId + "/buildings/" + second).with(identity()))
			.andExpect(status().isNoContent()).andExpect(header().string("Cache-Control", "no-store"));
		verify(service).deleteBuilding(userId, propertyId, second);
	}

	@TestConfiguration
	static class Security {
		@Bean SecurityFilterChain testSecurity(HttpSecurity http) throws Exception {
			return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
				.exceptionHandling(errors -> errors.authenticationEntryPoint((request, response, exception) -> response.setStatus(401))).build();
		}
	}
}
