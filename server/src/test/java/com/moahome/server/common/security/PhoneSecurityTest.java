package com.moahome.server.common.security;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;

import com.moahome.server.config.PhoneSecurityProperties;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PhoneSecurityTest {
	private final String encryptionKey = randomKey();

	private final String hmacKey = randomKey();

	private final PhoneSecurity security = security("key1", Map.of("key1", encryptionKey));

	@Test
	void encryptsWithFreshNonceAndDecryptsToCanonicalNumber() {
		String first = security.encrypt("+82 10-1234-5678");
		String second = security.encrypt("+821012345678");
		assertThat(first).isNotEqualTo(second).doesNotContain("12345678");
		assertThat(security.decrypt(first)).isEqualTo("+821012345678");
		assertThat(security.decrypt(second)).isEqualTo("+821012345678");
	}

	@Test
	void hashesEquivalentNumbersEquallyAndUsesSeparateKey() {
		assertThat(security.hmac("+82 (10) 1234-5678")).isEqualTo(security.hmac("+821012345678"))
		    .matches("[0-9a-f]{64}");
		assertThat(security.hmac("+821012345678")).isNotEqualTo(security.hmac("+821012345679"));
		PhoneSecurity other = new PhoneSecurity(
		    new PhoneSecurityProperties("key1", Map.of("key1", encryptionKey), randomKey()));
		assertThat(other.hmac("+821012345678")).isNotEqualTo(security.hmac("+821012345678"));
		assertThat(security.last4("+82 10-1234-5678")).isEqualTo("5678");
	}

	@Test
	void rejectsTamperingWrongKeysAndMalformedCiphertext() {
		String encrypted = security.encrypt("+821012345678");
		String[] parts = encrypted.split(":");
		byte[] ciphertext = Base64.getUrlDecoder().decode(parts[3]);
		ciphertext[0] ^= 1;
		String tampered = parts[0] + ":" + parts[1] + ":" + parts[2] + ":"
		    + Base64.getUrlEncoder().withoutPadding().encodeToString(ciphertext);
		assertThatThrownBy(() -> security.decrypt(tampered)).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> security("key1", Map.of("key1", randomKey())).decrypt(encrypted))
		    .isInstanceOf(IllegalArgumentException.class);
		for (String invalid : new String[] { "v2:key1:a:b", "v1:missing:a:b", "v1:key1:!:!", "", "plaintext" }) {
			assertThatThrownBy(() -> security.decrypt(invalid)).isInstanceOf(IllegalArgumentException.class);
		}
	}

	@Test
	void retainsOldKeyForDecryptionAfterRotationAndAuthenticatesKeyId() {
		String encrypted = security.encrypt("+821012345678");
		PhoneSecurity rotated = security("key2",
		    Map.of("key1", encryptionKey, "key2", randomKey(), "alias", encryptionKey));
		assertThat(rotated.decrypt(encrypted)).isEqualTo("+821012345678");
		assertThat(rotated.encrypt("+821012345678")).startsWith("v1:key2:");
		assertThatThrownBy(() -> rotated.decrypt(encrypted.replace(":key1:", ":alias:")))
		    .isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void rejectsInvalidNumbersWithoutIncludingPhoneInError() {
		for (String invalid : new String[] { "01012345678", "+82abc1012345678", "+012345678", "+821012345678901234",
		        "+82" }) {
			assertThatThrownBy(() -> security.encrypt(invalid)).isInstanceOf(IllegalArgumentException.class)
			    .hasMessageNotContaining(invalid);
		}
		assertThatThrownBy(() -> security.normalize(null)).isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void rejectsInvalidMissingAndReusedKeysWithoutDisclosingSecrets() {
		assertThatThrownBy(
		    () -> new PhoneSecurity(new PhoneSecurityProperties("key1", Map.of("key1", encryptionKey), encryptionKey)))
		    .isInstanceOf(IllegalArgumentException.class).hasMessageNotContaining(encryptionKey);
		assertThatThrownBy(() -> security("missing", Map.of("key1", encryptionKey)))
		    .isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> security("key1", Map.of("key1", "invalid")))
		    .isInstanceOf(IllegalArgumentException.class);
		assertThat(new PhoneSecurityProperties("key1", Map.of("key1", encryptionKey), hmacKey).toString())
		    .doesNotContain(encryptionKey, hmacKey);
	}

	private PhoneSecurity security(String keyId, Map<String, String> keys) {
		return new PhoneSecurity(new PhoneSecurityProperties(keyId, keys, hmacKey));
	}

	private static String randomKey() {
		byte[] bytes = new byte[32];
		new SecureRandom().nextBytes(bytes);
		return Base64.getEncoder().encodeToString(bytes);
	}
}
