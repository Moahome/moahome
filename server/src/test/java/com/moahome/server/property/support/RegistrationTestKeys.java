package com.moahome.server.property.support;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import com.moahome.server.config.*;
import org.springframework.test.context.DynamicPropertyRegistry;

public final class RegistrationTestKeys {
	private RegistrationTestKeys() {
	}

	public static String randomKey() {
		byte[] bytes = new byte[32];
		new SecureRandom().nextBytes(bytes);
		return Base64.getEncoder().encodeToString(bytes);
	}

	public static AccountSecurityProperties accountProperties() {
		return new AccountSecurityProperties("v1", Map.of("v1", randomKey()), randomKey());
	}

	public static RegistrationSecurityProperties fingerprintProperties() {
		return new RegistrationSecurityProperties("v1", Map.of("v1", randomKey()));
	}

	public static void register(DynamicPropertyRegistry registry) {
		var account = accountProperties();
		var fingerprint = fingerprintProperties();
		registry.add("moahome.account-security.active-key-id", account::activeKeyId);
		registry.add("moahome.account-security.encryption-keys.v1", () -> account.encryptionKeys().get("v1"));
		registry.add("moahome.account-security.hmac-key-base64", account::hmacKeyBase64);
		registry.add("moahome.registration-security.active-key-version", fingerprint::activeKeyVersion);
		registry.add("moahome.registration-security.fingerprint-keys.v1",
		    () -> fingerprint.fingerprintKeys().get("v1"));
	}
}
