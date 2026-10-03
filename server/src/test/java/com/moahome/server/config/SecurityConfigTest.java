package com.moahome.server.config;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SecurityConfigTest {
	private final SecurityConfig config = new SecurityConfig();

	@Test
	void refusesMissingShortOrInvalidSigningKeys() {
		for (String secret : List.of("", Base64.getEncoder().encodeToString(new byte[16]), "invalid-base64!")) {
			assertThatThrownBy(() -> config.jwtSigningKey(properties(secret, "http://localhost:3000")))
				.isInstanceOf(IllegalArgumentException.class);
		}
	}

	@Test
	void allowsExplicitOriginsAndRejectsWildcardsAndNonOrigins() {
		config.corsConfigurationSource(properties("unused", "http://localhost:3000"));
		for (String origin : List.of("*", "https://*.example.com", "null", "https://example.com/path", "file:///tmp/test")) {
			assertThatThrownBy(() -> config.corsConfigurationSource(properties("unused", origin)))
				.isInstanceOf(IllegalArgumentException.class);
		}
	}

	@Test
	void usesAtLeast256BitKeyAndRedactsPropertyString() {
		byte[] key = new byte[32];
		new SecureRandom().nextBytes(key);
		String secret = Base64.getEncoder().encodeToString(key);
		var properties = properties(secret, "https://app.example.com");
		assertThat(config.jwtSigningKey(properties).getEncoded()).hasSize(32);
		assertThat(properties.toString()).doesNotContain(secret);
	}

	private SecurityProperties properties(String secret, String origin) {
		return new SecurityProperties(secret, "moahome-server", "moahome-api", List.of(origin), true);
	}
}
