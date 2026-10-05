package com.moahome.server.property.controller;

import java.time.Instant;
import java.util.*;
import java.util.stream.Stream;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.auth.exception.*;
import com.moahome.server.property.dto.*;
import com.moahome.server.property.dto.PropertyRegistrationResponse.*;
import com.moahome.server.property.exception.*;
import com.moahome.server.property.service.PropertyRegistrationService;
import com.moahome.server.property.support.RegistrationFixtures;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(PropertyRegistrationController.class)
@org.springframework.test.context.ActiveProfiles("test")
@Import({PropertyRegistrationControllerTest.Security.class, RegistrationRequestConverter.class})
class PropertyRegistrationControllerTest {
	private static final UUID USER_ID = UUID.randomUUID();
	private static final UUID REQUEST_ID = UUID.randomUUID();
	private static final String PATH = "/api/property-registrations";
	@Autowired MockMvc mvc;
	@Autowired ObjectMapper mapper;
	@MockitoBean PropertyRegistrationService registrations;

	private org.springframework.test.web.servlet.request.RequestPostProcessor identity() {
		return authentication(UsernamePasswordAuthenticationToken.authenticated(
			new AuthPrincipal(USER_ID.toString(), UUID.randomUUID().toString()), null, List.of()));
	}

	@Test
	void normalizesBasicInfoReturnsNullOptionalsAndNeverUsesClientIdentity() throws Exception {
		when(registrations.validateBasicInfo(eq(USER_ID), any())).thenAnswer(call -> call.getArgument(1));
		mvc.perform(post(PATH + "/basic-info/validate").with(identity()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\" 모아빌라 \",\"address\":\" 주소 \",\"addressDetail\":\" \",\"hasBuildings\":false}"))
			.andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
			.andExpect(jsonPath("name").value("모아빌라")).andExpect(jsonPath("address").value("주소"))
			.andExpect(jsonPath("addressDetail").value(org.hamcrest.Matchers.nullValue()))
			.andExpect(jsonPath("propertyType").value(org.hamcrest.Matchers.nullValue()))
			.andExpect(jsonPath("hasBuildings").value(false)).andExpect(jsonPath("$.length()").value(5));
		verify(registrations).validateBasicInfo(USER_ID, new BasicInfoRequest("모아빌라", "주소", null, null, false));
		verifyNoMoreInteractions(registrations);
	}

	static Stream<String> invalidBasic() {
		return Stream.of(
			"{\"name\":\"빌라\",\"address\":\"주소\"}",
			"{\"name\":\"빌라\",\"address\":\"주소\",\"hasBuildings\":null}",
			"{\"name\":\"빌라\",\"address\":\"주소\",\"hasBuildings\":\"false\"}",
			"{\"name\":123,\"address\":\"주소\",\"hasBuildings\":false}",
			"{\"name\":{},\"address\":\"주소\",\"hasBuildings\":false}",
			"{\"name\":\" \",\"address\":\"주소\",\"hasBuildings\":false}",
			"{\"name\":\"빌라\",\"address\":\"주소\",\"hasBuildings\":false,\"role\":\"ADMIN\"}",
			"{\"name\":\"빌라\",\"name\":\"중복 키\",\"address\":\"주소\",\"hasBuildings\":false}",
			"{\"name\":\"빌라\",\"address\":\"주소\",\"hasBuildings\":false} {}",
			"{invalid"
		);
	}

	@ParameterizedTest
	@MethodSource("invalidBasic")
	void rejectsMalformedTypesMissingFieldsAndUnknownInput(String body) throws Exception {
		mvc.perform(post(PATH + "/basic-info/validate").with(identity()).contentType(MediaType.APPLICATION_JSON).content(body))
			.andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control", "no-store"))
			.andExpect(jsonPath("code").value("INVALID_REQUEST"))
			.andExpect(jsonPath("message").value("요청 형식이 올바르지 않습니다."))
			.andExpect(jsonPath("errors").doesNotExist());
		verifyNoInteractions(registrations);
	}

	@Test
	void validatesUnicodeBoundariesAfterTrimming() throws Exception {
		when(registrations.validateBasicInfo(eq(USER_ID), any())).thenAnswer(call -> call.getArgument(1));
		String valid = mapper.writeValueAsString(new BasicInfoRequest(" 😀".repeat(25) + " ", "가".repeat(255),
			"나".repeat(255), "다".repeat(30), true));
		mvc.perform(post(PATH + "/basic-info/validate").with(identity()).contentType(MediaType.APPLICATION_JSON).content(valid))
			.andExpect(status().isOk());
		for (BasicInfoRequest input : List.of(new BasicInfoRequest("😀".repeat(51), "주소", null, null, false),
			new BasicInfoRequest("이름", "가".repeat(256), null, null, false),
			new BasicInfoRequest("이름", "주소", "가".repeat(256), null, false),
			new BasicInfoRequest("이름", "주소", null, "가".repeat(31), false))) {
			mvc.perform(post(PATH + "/basic-info/validate").with(identity()).contentType(MediaType.APPLICATION_JSON)
				.content(mapper.writeValueAsString(input))).andExpect(status().isBadRequest());
		}
	}

	@Test
	void returns201ForCreation200ForReplayAndSameSnapshotForGet() throws Exception {
		var request = RegistrationFixtures.request(REQUEST_ID, true);
		var response = response();
		when(registrations.register(USER_ID, request))
			.thenReturn(new PropertyRegistrationService.RegistrationOutcome(response, true),
				new PropertyRegistrationService.RegistrationOutcome(response, false));
		when(registrations.getResult(USER_ID, REQUEST_ID)).thenReturn(response);
		String json = mapper.writeValueAsString(request);
		String first = mvc.perform(post(PATH).with(identity()).contentType(MediaType.APPLICATION_JSON).content(json))
			.andExpect(status().isCreated()).andExpect(header().string("Cache-Control", "no-store"))
			.andExpect(jsonPath("membership.role").value("ADMIN")).andExpect(jsonPath("summary.monthlyDefaultAmount").value(50000))
			.andReturn().getResponse().getContentAsString();
		String replay = mvc.perform(post(PATH).with(identity()).contentType(MediaType.APPLICATION_JSON).content(json))
			.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		String get = mvc.perform(get(PATH + "/" + REQUEST_ID).with(identity()))
			.andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
			.andReturn().getResponse().getContentAsString();
		assertThat(mapper.readTree(first)).isEqualTo(mapper.readTree(replay)).isEqualTo(mapper.readTree(get));
		assertThat(first).doesNotContain("00012345678", "예금주", "accountNumber", "holderName");
	}

	@Test
	void finalInputRejectsCoercionFractionsNullElementsUnknownNestedFieldsAndRangeOverflow() throws Exception {
		String valid = mapper.writeValueAsString(RegistrationFixtures.request(REQUEST_ID, true));
		for (String body : List.of(
			valid.replace("\"defaultAmount\":15000", "\"defaultAmount\":\"15000\""),
			valid.replace("\"defaultAmount\":15000", "\"defaultAmount\":0.0"),
			valid.replace("\"defaultAmount\":15000", "\"defaultAmount\":-1"),
			valid.replace("\"defaultAmount\":15000", "\"defaultAmount\":1000000000000000"),
			valid.replace("\"floor\":2", "\"floor\":\"2\""),
			valid.replace("\"floor\":2", "\"floor\":2.0"),
			valid.replace("\"floor\":2", "\"floor\":32768"),
			valid.replace("\"isPrimary\":true", "\"isPrimary\":\"true\""),
			valid.replace("\"accountNumber\":\"00012345678\"", "\"accountNumber\":12345678"),
			valid.replace("\"status\":\"ACTIVE\"", "\"status\":\"DELETED\""),
			valid.replace("\"bankCode\":\"SAMPLE\"", "\"bankCode\":\"SAMPLE\",\"holderResidentId\":\"private-id\""),
			valid.replace("\"units\":[{", "\"units\":[null,{"),
			valid.replace("\"units\":[", "\"units\":null,\"unused\":[")
		)) {
			mvc.perform(post(PATH).with(identity()).contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("INVALID_REQUEST"))
				.andExpect(jsonPath("message").value("등록 정보를 확인해주세요."));
		}
		verifyNoInteractions(registrations);
	}

	@Test
	void identifiesTypeErrorsAndRejectsNonCanonicalRequestId() throws Exception {
		String valid = mapper.writeValueAsString(RegistrationFixtures.request(REQUEST_ID, true));
		mvc.perform(post(PATH).with(identity()).contentType(MediaType.APPLICATION_JSON)
			.content(valid.replace("\"defaultAmount\":15000", "\"defaultAmount\":\"15000\"")))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("errors[0].field").value("feeItems[0].defaultAmount"))
			.andExpect(jsonPath("errors[0].reason").value("INVALID_TYPE"));
		mvc.perform(post(PATH).with(identity()).contentType(MediaType.APPLICATION_JSON)
			.content(valid.replace(REQUEST_ID.toString(), "1-1-1-1-1")))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("errors[0].field").value("requestId"))
			.andExpect(jsonPath("errors[0].reason").value("INVALID_FORMAT"));
		verifyNoInteractions(registrations);
	}

	@Test
	void fieldErrorsAndStorageFailuresExposeOnlySafeContractMessages() throws Exception {
		var request = RegistrationFixtures.request(REQUEST_ID, true);
		when(registrations.register(USER_ID, request)).thenThrow(RegistrationException.invalid(
			"units[0].buildingClientId", "INVALID_REFERENCE", "등록할 동을 선택해주세요."));
		mvc.perform(post(PATH).with(identity()).contentType(MediaType.APPLICATION_JSON)
			.content(mapper.writeValueAsString(request))).andExpect(status().isBadRequest())
			.andExpect(jsonPath("errors[0].field").value("units[0].buildingClientId"))
			.andExpect(jsonPath("errors[0].reason").value("INVALID_REFERENCE"));
		when(registrations.getResult(USER_ID, REQUEST_ID))
			.thenThrow(new DataAccessResourceFailureException("private SQL account 00012345678"));
		mvc.perform(get(PATH + "/" + REQUEST_ID).with(identity())).andExpect(status().isServiceUnavailable())
			.andExpect(jsonPath("code").value("REGISTRATION_SERVICE_UNAVAILABLE"))
			.andExpect(jsonPath("message").value("등록 서비스를 일시적으로 사용할 수 없습니다."));
		doThrow(new IllegalStateException("private secret")).when(registrations).getResult(USER_ID, REQUEST_ID);
		mvc.perform(get(PATH + "/" + REQUEST_ID).with(identity())).andExpect(status().isInternalServerError())
			.andExpect(jsonPath("message").value("요청을 처리하지 못했습니다."));
	}

	@Test
	void mapsMissingConflictProgressAndCurrentAccessErrors() throws Exception {
		for (RegistrationErrorCode code : List.of(RegistrationErrorCode.REGISTRATION_NOT_FOUND,
			RegistrationErrorCode.REGISTRATION_REQUEST_CONFLICT, RegistrationErrorCode.REGISTRATION_IN_PROGRESS)) {
			doThrow(new RegistrationException(code)).when(registrations).getResult(USER_ID, REQUEST_ID);
			mvc.perform(get(PATH + "/" + REQUEST_ID).with(identity())).andExpect(status().is(code.status().value()))
				.andExpect(jsonPath("code").value(code.name()));
		}
		doThrow(new AuthException(AuthErrorCode.ACCESS_DENIED)).when(registrations).getResult(USER_ID, REQUEST_ID);
		mvc.perform(get(PATH + "/" + REQUEST_ID).with(identity())).andExpect(status().isForbidden())
			.andExpect(jsonPath("code").value("ACCESS_DENIED"));
		mvc.perform(get(PATH + "/1-1-1-1-1").with(identity())).andExpect(status().isBadRequest());
	}

	@Test
	void rejectsUnauthenticatedRequestsAndNonJsonPost() throws Exception {
		mvc.perform(get(PATH + "/" + REQUEST_ID)).andExpect(status().isUnauthorized());
		mvc.perform(post(PATH).with(identity()).contentType(MediaType.TEXT_PLAIN).content("{}"))
			.andExpect(status().isUnsupportedMediaType()).andExpect(jsonPath("code").value("UNSUPPORTED_MEDIA_TYPE"));
		verifyNoInteractions(registrations);
	}

	private PropertyRegistrationResponse response() {
		return new PropertyRegistrationResponse(REQUEST_ID, new PropertySummary(UUID.randomUUID(), "모아빌라", true, "ACTIVE"),
			new MembershipSummary(UUID.randomUUID(), "ADMIN", "ACTIVE"), new RegistrationSummary(2, 2, 1, 4, 50000),
			Instant.parse("2026-10-05T03:00:00Z"));
	}

	@TestConfiguration
	static class Security {
		@Bean
		SecurityFilterChain testSecurity(HttpSecurity http) throws Exception {
			return http.csrf(csrf -> csrf.disable()).authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
				.exceptionHandling(errors -> errors.authenticationEntryPoint((request, response, exception) ->
					response.setStatus(401))).build();
		}
	}
}
