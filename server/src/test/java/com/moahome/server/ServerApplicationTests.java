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

	@DynamicPropertySource
	static void securityProperties(DynamicPropertyRegistry registry) {
		byte[] key = new byte[32];
		new SecureRandom().nextBytes(key);
		String secret = Base64.getEncoder().encodeToString(key);
		registry.add("moahome.security.jwt-secret-base64", () -> secret);
		registry.add("moahome.phone-security.encryption-keys.v1", ServerApplicationTests::randomKey);
		registry.add("moahome.phone-security.hmac-key-base64", ServerApplicationTests::randomKey);
	}

	private static String randomKey() {
		byte[] bytes = new byte[32];
		new SecureRandom().nextBytes(bytes);
		return Base64.getEncoder().encodeToString(bytes);
	}

	@Test
	void contextLoads() {
	}

}
