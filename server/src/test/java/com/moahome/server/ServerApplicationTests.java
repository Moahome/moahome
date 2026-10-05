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
	@MockitoBean private UserRepository users;
	@MockitoBean private SocialAccountRepository socialAccounts;
	@MockitoBean private com.moahome.server.property.service.PropertyRegistrationService registrations;
	@MockitoBean private com.moahome.server.property.repo.PropertyRegistrationLock registrationLock;

	@DynamicPropertySource
	static void securityProperties(DynamicPropertyRegistry registry) {
		com.moahome.server.property.support.RegistrationTestKeys.register(registry);
		byte[] key = new byte[32];
		new SecureRandom().nextBytes(key);
		String secret = Base64.getEncoder().encodeToString(key);
		registry.add("moahome.security.jwt-secret-base64", () -> secret);
	}

	@Test
	void contextLoads() {
	}

}
