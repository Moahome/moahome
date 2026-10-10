package com.moahome.server;

import java.security.SecureRandom;
import java.util.Base64;

import com.moahome.server.user.repo.UserRepository;
import com.moahome.server.auth.repo.SocialAccountRepository;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest
@ActiveProfiles("test")
class ServerApplicationTests {
	@MockitoBean private com.moahome.server.property.service.ManagementAccessService management;
	@MockitoBean private com.moahome.server.property.service.UnitManagementService unitManagement;
	@MockitoBean private UserRepository users;
	@MockitoBean private SocialAccountRepository socialAccounts;
	@MockitoBean private com.moahome.server.property.service.PropertyRegistrationService registrations;
	@MockitoBean private com.moahome.server.property.repo.PropertyRegistrationLock registrationLock;

	@DynamicPropertySource
	static void securityProperties(DynamicPropertyRegistry registry) {
		com.moahome.server.property.support.RegistrationTestKeys.register(registry);
		byte[] accessKey = new byte[64];
		byte[] refreshKey = new byte[64];
		SecureRandom random = new SecureRandom();
		random.nextBytes(accessKey);
		random.nextBytes(refreshKey);
		String accessSecret = Base64.getEncoder().encodeToString(accessKey);
		String refreshSecret = Base64.getEncoder().encodeToString(refreshKey);
		registry.add("moahome.security.jwt-access-secret-base64", () -> accessSecret);
		registry.add("moahome.security.jwt-refresh-secret-base64", () -> refreshSecret);
	}

	@Test
	void contextLoads() {
	}

}
