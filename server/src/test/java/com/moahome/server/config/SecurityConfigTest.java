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
			assertThatThrownBy(() -> config.jwtAccessSigningKey(properties(secret, "http://localhost:3000")))
				.isInstanceOf(IllegalArgumentException.class);
			var properties = new SecurityProperties(randomSecret(64), secret, "moahome-server", "moahome-api",
				List.of("http://localhost:3000"), true);
			assertThatThrownBy(() -> config.jwtRefreshSigningKey(properties, config.jwtAccessSigningKey(properties)))
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
	void supports32And64ByteIndependentKeysAndRedactsBothSecrets() {
		for (int length : List.of(32, 64)) {
			String secret = randomSecret(length);
			var properties = properties(secret, "https://app.example.com");
			var accessKey = config.jwtAccessSigningKey(properties);
			assertThat(accessKey.getEncoded()).hasSize(length);
			assertThat(config.jwtRefreshSigningKey(properties, accessKey).getEncoded()).hasSize(64);
			assertThat(properties.toString()).doesNotContain(secret, properties.jwtRefreshSecretBase64());
		}
	}

	@Test
	void rejectsTheSameDecodedKeyEvenWithDifferentBase64Padding() {
		String secret = randomSecret(64);
		var properties = new SecurityProperties(secret, secret.replace("=", ""), "moahome-server", "moahome-api",
			List.of("https://app.example.com"), true);
		assertThatThrownBy(() -> config.jwtRefreshSigningKey(properties, config.jwtAccessSigningKey(properties)))
			.isInstanceOf(IllegalArgumentException.class).hasMessageContaining("must be different");
	}

	private SecurityProperties properties(String secret, String origin) {
		return new SecurityProperties(secret, randomSecret(64), "moahome-server", "moahome-api", List.of(origin), true);
	}

	private String randomSecret(int length) {
		byte[] bytes = new byte[length];
		new SecureRandom().nextBytes(bytes);
		return Base64.getEncoder().encodeToString(bytes);
	}
}
