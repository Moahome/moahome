package com.moahome.server.common.security;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import com.moahome.server.config.PhoneSecurityProperties;

/** 주민 연락처의 정규화·암호화·검색값·마스킹을 제공하는 공통 보안 코드입니다. */
public class PhoneSecurity {
	private static final int NONCE_LENGTH = 12;
	private static final int TAG_LENGTH_BITS = 128;
	private static final String FORMAT_VERSION = "v1";
	private static final byte[] HMAC_CONTEXT = "moahome:phone:v1:".getBytes(StandardCharsets.UTF_8);
	private final String activeKeyId;
	private final Map<String, SecretKey> encryptionKeys;
	private final SecretKey hmacKey;
	private final SecureRandom random = new SecureRandom();

	public PhoneSecurity(PhoneSecurityProperties properties) {
		activeKeyId = properties.activeKeyId();
		Map<String, SecretKey> keys = new HashMap<>();
		properties.encryptionKeys().forEach((id, encodedKey) -> {
			if (!id.matches("[A-Za-z0-9_-]{1,32}")) {
				throw new IllegalArgumentException("Invalid phone encryption key ID");
			}
			keys.put(id, new SecretKeySpec(decodeKey(encodedKey), "AES"));
		});
		if (!keys.containsKey(activeKeyId)) {
			throw new IllegalArgumentException("Active phone encryption key is not configured");
		}
		byte[] hmacBytes = decodeKey(properties.hmacKeyBase64());
		for (SecretKey key : keys.values()) {
			if (MessageDigest.isEqual(key.getEncoded(), hmacBytes)) {
				throw new IllegalArgumentException("Phone encryption and HMAC keys must be different");
			}
		}
		encryptionKeys = Map.copyOf(keys);
		hmacKey = new SecretKeySpec(hmacBytes, "HmacSHA256");
	}

	/** Accepts an international number; no country is inferred from a local number. */
	public String normalize(String phone) {
		if (phone == null || phone.length() > 64 || !phone.matches("\\+[0-9 ()-]+")) {
			throw new IllegalArgumentException("Phone number must include an international country code");
		}
		String normalized = phone.replaceAll("[ ()-]", "");
		if (!normalized.matches("\\+[1-9][0-9]{3,14}")) {
			throw new IllegalArgumentException("Invalid international phone number format");
		}
		return normalized;
	}

	public String encrypt(String phone) {
		String normalized = normalize(phone);
		byte[] nonce = new byte[NONCE_LENGTH];
		random.nextBytes(nonce);
		try {
			Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.ENCRYPT_MODE, encryptionKeys.get(activeKeyId), new GCMParameterSpec(TAG_LENGTH_BITS, nonce));
			cipher.updateAAD(aad(activeKeyId));
			byte[] encrypted = cipher.doFinal(normalized.getBytes(StandardCharsets.UTF_8));
			Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
			return FORMAT_VERSION + ":" + activeKeyId + ":" + encoder.encodeToString(nonce) + ":"
				+ encoder.encodeToString(encrypted);
		} catch (GeneralSecurityException exception) {
			throw new IllegalStateException("Phone encryption failed");
		}
	}

	public String decrypt(String encryptedPhone) {
		if (encryptedPhone == null || encryptedPhone.length() > 256) {
			throw new IllegalArgumentException("Invalid encrypted phone value");
		}
		String[] parts = encryptedPhone.split(":", -1);
		if (parts.length != 4 || !FORMAT_VERSION.equals(parts[0]) || !encryptionKeys.containsKey(parts[1])) {
			throw new IllegalArgumentException("Invalid encrypted phone value or unavailable key");
		}
		try {
			byte[] nonce = Base64.getUrlDecoder().decode(parts[2]);
			byte[] ciphertext = Base64.getUrlDecoder().decode(parts[3]);
			if (nonce.length != NONCE_LENGTH || ciphertext.length <= TAG_LENGTH_BITS / 8) {
				throw new IllegalArgumentException("Invalid encrypted phone value");
			}
			Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.DECRYPT_MODE, encryptionKeys.get(parts[1]), new GCMParameterSpec(TAG_LENGTH_BITS, nonce));
			cipher.updateAAD(aad(parts[1]));
			return normalize(new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8));
		} catch (GeneralSecurityException | IllegalArgumentException exception) {
			throw new IllegalArgumentException("Phone decryption failed");
		}
	}

	public String hmac(String phone) {
		String normalized = normalize(phone);
		try {
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(hmacKey);
			mac.update(HMAC_CONTEXT);
			return HexFormat.of().formatHex(mac.doFinal(normalized.getBytes(StandardCharsets.UTF_8)));
		} catch (GeneralSecurityException exception) {
			throw new IllegalStateException("Phone lookup hash failed");
		}
	}

	public String last4(String phone) {
		String normalized = normalize(phone);
		return normalized.substring(normalized.length() - 4);
	}

	private byte[] aad(String keyId) {
		// Preserve the v1 context for compatibility with previously encrypted phone values.
		return ("moahome:user:phone:" + FORMAT_VERSION + ":" + keyId).getBytes(StandardCharsets.UTF_8);
	}

	private byte[] decodeKey(String encodedKey) {
		try {
			byte[] key = Base64.getDecoder().decode(encodedKey);
			if (key.length != 32) {
				throw new IllegalArgumentException();
			}
			return key;
		} catch (IllegalArgumentException exception) {
			throw new IllegalArgumentException("Phone security keys must be Base64 encoded 32-byte random keys");
		}
	}
}
