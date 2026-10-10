package com.moahome.server.config;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;

import com.moahome.server.auth.repo.SocialAccountRepository;
import com.moahome.server.auth.service.AuthService;
import com.moahome.server.billing.domain.FeeItemCode;
import com.moahome.server.property.repo.PropertyRegistrationLock;
import com.moahome.server.property.service.PropertyRegistrationService;
import com.moahome.server.property.support.RegistrationTestKeys;
import com.moahome.server.user.repo.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {"springdoc.api-docs.enabled=true",
	"moahome.security.allowed-origins=http://localhost:3000,http://localhost:4000,https://app.example.test"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OpenApiIntegrationTest {
	@Autowired private MockMvc mvc;
	@Autowired private ObjectMapper mapper;
	@MockitoBean private com.moahome.server.property.service.ManagementAccessService management;
	@MockitoBean private com.moahome.server.property.service.UnitManagementService unitManagement;
	@MockitoBean private AuthService auth;
	@MockitoBean private UserRepository users;
	@MockitoBean private SocialAccountRepository socialAccounts;
	@MockitoBean private PropertyRegistrationService registrations;
	@MockitoBean private PropertyRegistrationLock registrationLock;

	@DynamicPropertySource
	static void securityProperties(DynamicPropertyRegistry registry) {
		RegistrationTestKeys.register(registry);
		SecureRandom random = new SecureRandom();
		byte[] accessKey = new byte[64];
		byte[] refreshKey = new byte[64];
		random.nextBytes(accessKey);
		random.nextBytes(refreshKey);
		registry.add("moahome.security.jwt-access-secret-base64", () -> Base64.getEncoder().encodeToString(accessKey));
		registry.add("moahome.security.jwt-refresh-secret-base64", () -> Base64.getEncoder().encodeToString(refreshKey));
	}

	@Test
	void servesDefinitionsWithoutAuthenticationOrTokenValidation() throws Exception {
		mvc.perform(get("/v3/api-docs").header("Authorization", "Bearer expired-token"))
			.andExpect(status().isOk()).andExpect(jsonPath("$.info.title").value("모아홈 API"));
		mvc.perform(get("/v3/api-docs.yaml")).andExpect(status().isOk())
			.andExpect(content().string(containsString("openapi:")));
		verifyNoInteractions(auth);
	}

	@Test
	void allowsSwaggerOriginForDefinitionsAndBusinessPreflightButRejectsUnknownOrigins() throws Exception {
		mvc.perform(get("/v3/api-docs").header("Origin", "http://localhost:4000"))
			.andExpect(status().isOk())
			.andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:4000"))
			.andExpect(header().string("Access-Control-Allow-Credentials", "true"));
		for (String path : List.of("/v3/api-docs", "/api/property-registrations", "/api/auth/web/refresh")) {
			mvc.perform(options(path).header("Origin", "http://localhost:4000")
				.header("Access-Control-Request-Method", path.equals("/v3/api-docs") ? "GET" : "POST")
				.header("Access-Control-Request-Headers", "Authorization,Content-Type,X-CSRF-TOKEN"))
				.andExpect(status().isOk())
				.andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:4000"));
		}
		mvc.perform(get("/v3/api-docs").header("Origin", "https://unknown.example.test"))
			.andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
	}

	@Test
	void localSettingsKeepExistingOriginsAndAddSwaggerWithoutEnablingEmbeddedUi() {
		new ApplicationContextRunner()
			.withInitializer(new ConfigDataApplicationContextInitializer())
			.withPropertyValues("spring.config.location=classpath:application.properties", "spring.profiles.active=local",
				"WEB_ALLOWED_ORIGINS=https://app.example.test")
			.run(context -> {
				assertThat(context.getEnvironment().getProperty("moahome.security.allowed-origins"))
					.isEqualTo("https://app.example.test,http://localhost:4000");
				assertThat(context.getEnvironment().getProperty("springdoc.api-docs.enabled", Boolean.class)).isTrue();
				assertThat(context.getEnvironment().getProperty("springdoc.swagger-ui.enabled", Boolean.class)).isFalse();
			});
	}

	@Test
	void keepsBusinessAndWebAuthenticationProtectedAndRejectsDocumentWrites() throws Exception {
		mvc.perform(get("/api/users/me")).andExpect(status().isUnauthorized());
		mvc.perform(post("/api/property-registrations")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/auth/web/csrf")).andExpect(status().isUnauthorized());
		mvc.perform(post("/v3/api-docs")).andExpect(status().isForbidden());
		mvc.perform(get("/v3/api-docs-other")).andExpect(status().isUnauthorized());
		mvc.perform(get("/swagger-ui.html")).andExpect(status().isUnauthorized());
	}

	@Test
	void documentsImplementedEndpointsAndTheirDifferentAuthenticationContracts() throws Exception {
		var document = mapper.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString());
		assertThat(document.path("paths").properties()).hasSize(16);
		for (String path : List.of("/api/users/me/managed-properties", "/api/properties/{propertyId}/management-context")) {
			assertThat(document.path("paths").path(path).at("/get/security/0/bearerAuth").isArray()).isTrue();
		}
		for (String method : List.of("get", "post")) {
			assertThat(document.path("paths").path("/api/properties/{propertyId}/units").path(method).at("/security/0/bearerAuth").isArray()).isTrue();
		}
		assertThat(document.path("paths").path("/api/properties/{propertyId}/units/{unitId}").path("put").at("/security/0/bearerAuth").isArray()).isTrue();
		assertThat(document.at("/components/securitySchemes/bearerAuth/type").asText()).isEqualTo("http");
		assertThat(document.at("/components/securitySchemes/webRefreshCookie/in").asText()).isEqualTo("cookie");
		assertThat(document.at("/paths/~1api~1users~1me/get/security/0/bearerAuth").isArray()).isTrue();
		assertThat(document.at("/paths/~1api~1users~1me/get/parameters").isMissingNode()).isTrue();
		var register = document.at("/paths/~1api~1property-registrations/post");
		assertThat(register.at("/security/0/bearerAuth").isArray()).isTrue();
		assertThat(register.at("/responses/200/content/application~1json/schema/$ref").asText())
			.isEqualTo("#/components/schemas/PropertyRegistrationResponse");
		assertThat(register.at("/responses/201/content/application~1json/schema/$ref").asText())
			.isEqualTo("#/components/schemas/PropertyRegistrationResponse");
		assertThat(register.at("/responses/409").isMissingNode()).isFalse();
		assertThat(register.at("/responses/400/content/application~1json/schema/$ref").asText())
			.isEqualTo("#/components/schemas/RegistrationErrorResponse");
		assertThat(register.at("/responses/401/content/application~1json/schema/$ref").asText())
			.isEqualTo("#/components/schemas/AuthErrorResponse");
		assertThat(register.at("/requestBody/content/application~1json/schema/$ref").asText())
			.isEqualTo("#/components/schemas/PropertyRegistrationRequest");
		var webRefresh = document.at("/paths/~1api~1auth~1web~1refresh/post");
		assertThat(webRefresh.at("/security/0/webRefreshCookie").isArray()).isTrue();
		assertThat(webRefresh.at("/parameters/0/name").asText()).isEqualTo("X-CSRF-TOKEN");
		assertThat(webRefresh.at("/parameters/0/in").asText()).isEqualTo("header");
		assertThat(webRefresh.at("/parameters/0/required").asBoolean()).isTrue();
		assertThat(document.at("/paths/~1api~1auth~1app~1refresh/post/security").isMissingNode()).isTrue();
		for (String client : List.of("web", "app")) {
			var responses = document.path("paths").path("/api/auth/" + client + "/logout").path("post").path("responses");
			assertThat(responses.path("204").path("content").isMissingNode()).isTrue();
			assertThat(responses.path("200").isMissingNode()).isTrue();
		}
		var basicSchema = document.at("/components/schemas/BasicInfoRequest");
		assertThat(basicSchema.path("required").toString()).contains("name", "address", "hasBuildings");
		assertThat(basicSchema.path("additionalProperties").asBoolean()).isFalse();
		assertThat(basicSchema.at("/properties/name/maxLength").asInt()).isEqualTo(50);
		assertThat(document.at("/components/schemas/UnitInput/properties/status/enum").toString())
			.contains("ACTIVE", "VACANT").doesNotContain("INACTIVE");
		var feeSchema = document.at("/components/schemas/FeeItemInput");
		assertThat(feeSchema.path("required").toString()).contains("itemName", "defaultAmount").doesNotContain("itemCode");
		var feeCodes = feeSchema.at("/properties/itemCode/enum");
		assertThat(feeCodes.size()).isEqualTo(FeeItemCode.values().length);
		for (FeeItemCode code : FeeItemCode.values()) {
			assertThat(feeCodes.toString()).contains("\"" + code.name() + "\"");
		}
	}
}
