package com.moahome.server.user.controller;

import java.util.List;
import java.util.UUID;

import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.user.domain.SystemRole;
import com.moahome.server.user.domain.UserStatus;
import com.moahome.server.user.dto.CurrentUserResponse;
import com.moahome.server.user.exception.UserErrorCode;
import com.moahome.server.user.exception.UserException;
import com.moahome.server.user.service.UserService;
import com.moahome.server.user.service.ProfileImageService;
import com.moahome.server.user.dto.ProfileSaveRequest;
import com.moahome.server.user.exception.ProfileImageException;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.any;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(UserController.class)
@ActiveProfiles("test")
@Import(UserControllerTest.Security.class)
class UserControllerTest {
	private static final UUID USER_ID = UUID.randomUUID();

	@Autowired
	MockMvc mvc;

	@MockitoBean
	UserService users;

	@MockitoBean
	ProfileImageService images;

	private RequestPostProcessor identity() {
		return authentication(UsernamePasswordAuthenticationToken.authenticated(
		    new AuthPrincipal(USER_ID.toString(), UUID.randomUUID().toString()), null, List.of()));
	}

	@Test
	void updatesOnlyAuthenticatedAccountAndReturnsNormalizedProfileWithoutCaching() throws Exception {
		when(users.updateDisplayName(USER_ID, "새 이름"))
		    .thenReturn(new CurrentUserResponse(USER_ID, "새 이름", "https://example.test/avatar.png",
		        SystemRole.USER, UserStatus.ACTIVE, false));
		mvc.perform(patch("/api/users/me").with(identity()).param("userId", UUID.randomUUID().toString())
		    .contentType(MediaType.APPLICATION_JSON).content("{\"displayName\":\" 새 이름 \"}"))
		    .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
		    .andExpect(jsonPath("id").value(USER_ID.toString()))
		    .andExpect(jsonPath("displayName").value("새 이름"))
		    .andExpect(jsonPath("profileImageUrl").value("https://example.test/avatar.png"))
		    .andExpect(jsonPath("systemRole").value("USER"));
		verify(users).updateDisplayName(USER_ID, "새 이름");
	}

	@Test
	void validatesBlankMissingOversizedAndMalformedNamesBeforeService() throws Exception {
		for (String body : List.of("{}", "{\"displayName\":null}", "{\"displayName\":\" \"}",
		    "{\"displayName\":\"" + "가".repeat(51) + "\"}", "{\"displayName\":")) {
			mvc.perform(patch("/api/users/me").with(identity()).contentType(MediaType.APPLICATION_JSON).content(body))
			    .andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control", "no-store"))
			    .andExpect(jsonPath("code").value("INVALID_REQUEST"));
		}
		verifyNoInteractions(users);
	}

	@Test
	void allowsFiftyUnicodeCodePoints() throws Exception {
		String name = "😀".repeat(50);
		when(users.updateDisplayName(USER_ID, name))
		    .thenReturn(new CurrentUserResponse(USER_ID, name, null, SystemRole.USER, UserStatus.ACTIVE));
		mvc.perform(patch("/api/users/me").with(identity()).contentType(MediaType.APPLICATION_JSON)
		    .content("{\"displayName\":\"" + name + "\"}")).andExpect(status().isOk());
	}

	@Test
	void authenticationIsRequiredBeforeWriting() throws Exception {
		mvc.perform(patch("/api/users/me").contentType(MediaType.APPLICATION_JSON)
		    .content("{\"displayName\":\"이름\"}")).andExpect(status().isUnauthorized());
		verifyNoInteractions(users);
	}

	@Test
	void unavailableAccountsAndStorageHaveDistinctSafeErrors() throws Exception {
		when(users.updateDisplayName(USER_ID, "이름"))
		    .thenThrow(new UserException(UserErrorCode.ACCOUNT_UNAVAILABLE))
		    .thenThrow(new DataAccessResourceFailureException("private database detail"));
		mvc.perform(patch("/api/users/me").with(identity()).contentType(MediaType.APPLICATION_JSON)
		    .content("{\"displayName\":\"이름\"}")).andExpect(status().isForbidden())
		    .andExpect(jsonPath("code").value("ACCOUNT_UNAVAILABLE"));
		mvc.perform(patch("/api/users/me").with(identity()).contentType(MediaType.APPLICATION_JSON)
		    .content("{\"displayName\":\"이름\"}")).andExpect(status().isServiceUnavailable())
		    .andExpect(jsonPath("code").value("AUTH_SERVICE_UNAVAILABLE"))
		    .andExpect(jsonPath("message").value("인증 서비스를 일시적으로 사용할 수 없습니다."));
	}

	@Test
	void multipartProfileSaveUsesBearerIdentityAndValidatesName() throws Exception {
		when(images.save(eq(USER_ID), any(ProfileSaveRequest.class)))
		    .thenReturn(new CurrentUserResponse(USER_ID, "새 이름", null, SystemRole.USER, UserStatus.ACTIVE));
		mvc.perform(multipart(HttpMethod.PUT, "/api/users/me/profile").with(identity())
		    .param("displayName", " 새 이름 ").param("removeImage", "true")
		    .param("userId", UUID.randomUUID().toString()))
		    .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
		    .andExpect(jsonPath("id").value(USER_ID.toString()));
		verify(images).save(USER_ID, new ProfileSaveRequest("새 이름", true, null));
		mvc.perform(multipart(HttpMethod.PUT, "/api/users/me/profile").with(identity()).param("displayName", " "))
		    .andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("INVALID_REQUEST"));
	}

	@Test
	void privateImageBytesRequireAuthenticationAndErrorsRemainJson() throws Exception {
		mvc.perform(get("/api/users/me/profile-image")).andExpect(status().isUnauthorized());
		mvc.perform(multipart(HttpMethod.PUT, "/api/users/me/profile")
		    .file(new MockMultipartFile("image", "photo.png", "image/png", new byte[] { 1 })))
		    .andExpect(status().isUnauthorized());
		verifyNoInteractions(images);
		when(images.read(USER_ID)).thenReturn(new byte[] { 1, 2, 3 });
		mvc.perform(get("/api/users/me/profile-image").with(identity()).param("v", UUID.randomUUID().toString())
		    .param("userId", UUID.randomUUID().toString()))
		    .andExpect(status().isOk()).andExpect(content().contentType("image/png"))
		    .andExpect(header().string("Cache-Control", "no-store"))
		    .andExpect(header().string("X-Content-Type-Options", "nosniff"))
		    .andExpect(content().bytes(new byte[] { 1, 2, 3 }));
		when(images.read(USER_ID)).thenThrow(new ProfileImageException(ProfileImageException.Code.PROFILE_IMAGE_NOT_FOUND));
		mvc.perform(get("/api/users/me/profile-image").with(identity()).accept("image/png", "application/json"))
		    .andExpect(status().isNotFound()).andExpect(content().contentType(MediaType.APPLICATION_JSON))
		    .andExpect(jsonPath("code").value("PROFILE_IMAGE_NOT_FOUND"));
	}

	@TestConfiguration
	static class Security {
		@Bean
		SecurityFilterChain testSecurity(HttpSecurity http) throws Exception {
			return http.csrf(csrf -> csrf.disable())
			    .authorizeHttpRequests(requests -> requests.anyRequest().authenticated())
			    .exceptionHandling(errors -> errors.authenticationEntryPoint((request, response, error) -> response.setStatus(401)))
			    .build();
		}
	}
}
