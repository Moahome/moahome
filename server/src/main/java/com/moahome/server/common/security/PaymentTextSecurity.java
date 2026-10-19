package com.moahome.server.common.security;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import com.moahome.server.config.AccountSecurityProperties;

public class PaymentTextSecurity {
	private final String activeKeyId;

	private final Map<String, SecretKey> encryptionKeys;

	private final SecretKey hmacKey;

	private final SecureRandom random = new SecureRandom();

	public PaymentTextSecurity(AccountSecurityProperties properties) {
		activeKeyId = properties.activeKeyId();
		Map<String, SecretKey> keys = new HashMap<>();
		properties.encryptionKeys().forEach((id, value) -> {
			if (!id.matches("[A-Za-z0-9_-]{1,32}")) {
				throw new IllegalArgumentException("Invalid account encryption key ID");
			}
			keys.put(id, new SecretKeySpec(decodeKey(value), "AES"));
		});
		if (!keys.containsKey(activeKeyId)) {
			throw new IllegalArgumentException("Active account encryption key is not configured");
		}
		byte[] hmac = decodeKey(properties.hmacKeyBase64());
		if (keys.values().stream().anyMatch(key -> MessageDigest.isEqual(key.getEncoded(), hmac))) {
			throw new IllegalArgumentException("Account encryption and HMAC keys must differ");
		}
		encryptionKeys = Map.copyOf(keys);
		hmacKey = new SecretKeySpec(hmac, "HmacSHA256");
	}

	/** 입금자명·메모·처리 사유를 용도 구분된 AES-GCM으로 암호화합니다. */
	public ProtectedText protect(String number) {
		requireNumber(number);
		byte[] nonce = new byte[12];
		random.nextBytes(nonce);
		try {
			Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.ENCRYPT_MODE, encryptionKeys.get(activeKeyId), new GCMParameterSpec(128, nonce));
			cipher.updateAAD(aad(activeKeyId));
			Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
			String encrypted = "v1:" + activeKeyId + ":" + encoder.encodeToString(nonce) + ":"
			    + encoder.encodeToString(cipher.doFinal(number.getBytes(StandardCharsets.UTF_8)));
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(hmacKey);
			mac.update("moahome:payment-text:v1:".getBytes(StandardCharsets.UTF_8));
			String hash = HexFormat.of().formatHex(mac.doFinal(number.getBytes(StandardCharsets.UTF_8)));
			return new ProtectedText(encrypted, hash);
		} catch (GeneralSecurityException exception) {
			throw new IllegalStateException("Account protection failed");
		}
	}

	/** 키 ID와 인증 태그를 검증해 변조된 암호문과 다른 용도의 암호문을 거부합니다. */
	public String decrypt(String encrypted) {
		if (encrypted == null)
			return null;
		if (encrypted.length() > 8192) {
			throw new IllegalArgumentException("Invalid encrypted account");
		}
		String[] parts = encrypted.split(":", -1);
		if (parts.length != 4 || !"v1".equals(parts[0]) || !encryptionKeys.containsKey(parts[1])) {
			throw new IllegalArgumentException("Invalid encrypted account");
		}
		try {
			byte[] nonce = Base64.getUrlDecoder().decode(parts[2]);
			if (nonce.length != 12) {
				throw new IllegalArgumentException("Invalid encrypted account");
			}
			Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.DECRYPT_MODE, encryptionKeys.get(parts[1]), new GCMParameterSpec(128, nonce));
			cipher.updateAAD(aad(parts[1]));
			String number = new String(cipher.doFinal(Base64.getUrlDecoder().decode(parts[3])), StandardCharsets.UTF_8);
			requireNumber(number);
			return number;
		} catch (GeneralSecurityException | IllegalArgumentException exception) {
			throw new IllegalArgumentException("Account decryption failed");
		}
	}

	/** 입금자명 매칭은 유니코드 정규화·공백 제거 후 HMAC으로 비교하며 원문은 로그에 남기지 않습니다. */
	public String nameHash(String value) {
		String normalized = java.text.Normalizer.normalize(value, java.text.Normalizer.Form.NFC).replaceAll("(?U)\\s+",
		    "");
		requireNumber(normalized);
		try {
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(hmacKey);
			mac.update("moahome:payment-text:v1:".getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(mac.doFinal(normalized.getBytes(StandardCharsets.UTF_8)));
		} catch (GeneralSecurityException exception) {
			throw new IllegalStateException("Payment name hash failed");
		}
	}

	private void requireNumber(String number) {
		if (number == null || number.isBlank() || number.length() > 1000) {
			throw new IllegalArgumentException("Invalid payment text");
		}
	}

	private byte[] aad(String keyId) {
		return ("moahome:payment-text:v1:" + keyId).getBytes(StandardCharsets.UTF_8);
	}

	private byte[] decodeKey(String encoded) {
		try {
			byte[] key = Base64.getDecoder().decode(encoded);
			if (key.length == 32) {
				return key;
			}
		} catch (IllegalArgumentException exception) {
			// 키 원문과 설정값을 예외에 포함하지 않습니다.
		}
		throw new IllegalArgumentException("Account keys must be Base64 encoded 32-byte random keys");
	}

	public record ProtectedText(String encrypted, String hmac) {
		@Override
		public String toString() {
			return "ProtectedText[REDACTED]";
		}
	}
}
