package com.moahome.server.common.security;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import com.moahome.server.config.AccountSecurityProperties;

/** 유효한 개인 초대의 재전달을 위해 코드만 보호하며 계좌와 다른 AAD로 암호문의 용도·대상 혼입을 차단합니다. */
public final class InvitationCodeSecurity {
	private final String activeKeyId;

	private final Map<String, SecretKey> keys;

	private final SecureRandom random = new SecureRandom();
	public InvitationCodeSecurity(AccountSecurityProperties properties) {
		activeKeyId = properties.activeKeyId();
		Map<String, SecretKey> loaded = new HashMap<>();
		properties.encryptionKeys().forEach((id, value) -> {
			if (!id.matches("[A-Za-z0-9_-]{1,32}"))
				throw new IllegalArgumentException("Invalid invitation key ID");
			byte[] key = Base64.getDecoder().decode(value);
			if (key.length != 32)
				throw new IllegalArgumentException("Invalid invitation key length");
			loaded.put(id, new SecretKeySpec(key, "AES"));
		});
		if (!loaded.containsKey(activeKeyId))
			throw new IllegalArgumentException("Invitation key unavailable");
		keys = Map.copyOf(loaded);
	}

	/** 무작위 nonce와 초대·관리대상 ID를 인증해 다른 초대 행에 암호문을 복사해도 복호화되지 않게 합니다. */
	public String encrypt(UUID property, UUID invitation, String code) {
		if (code == null || !code.matches("R(?:-[A-HJ-NP-Z2-9]{4}){3}"))
			throw new IllegalArgumentException("Invalid invitation code");
		byte[] nonce = new byte[12];
		random.nextBytes(nonce);
		try {
			Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.ENCRYPT_MODE, keys.get(activeKeyId), new GCMParameterSpec(128, nonce));
			cipher.updateAAD(aad(activeKeyId, property, invitation));
			var base64 = Base64.getUrlEncoder().withoutPadding();
			return "v1:" + activeKeyId + ":" + base64.encodeToString(nonce) + ":"
			    + base64.encodeToString(cipher.doFinal(code.getBytes(StandardCharsets.UTF_8)));
		} catch (GeneralSecurityException failure) {
			throw new IllegalStateException("Invitation protection failed");
		}
	}

	/** 키 ID·인증 태그·대상 바인딩을 확인하며 코드와 키 원문은 예외에 넣지 않습니다. */
	public String decrypt(UUID property, UUID invitation, String encrypted) {
		if (encrypted == null || encrypted.length() > 512)
			throw new IllegalArgumentException("Invalid protected invitation");
		String[] parts = encrypted.split(":", -1);
		if (parts.length != 4 || !"v1".equals(parts[0]) || !keys.containsKey(parts[1]))
			throw new IllegalArgumentException("Invalid protected invitation");
		try {
			byte[] nonce = Base64.getUrlDecoder().decode(parts[2]);
			if (nonce.length != 12)
				throw new IllegalArgumentException("Invalid invitation nonce");
			Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.DECRYPT_MODE, keys.get(parts[1]), new GCMParameterSpec(128, nonce));
			cipher.updateAAD(aad(parts[1], property, invitation));
			return new String(cipher.doFinal(Base64.getUrlDecoder().decode(parts[3])), StandardCharsets.UTF_8);
		} catch (GeneralSecurityException | IllegalArgumentException failure) {
			throw new IllegalArgumentException("Invitation recovery failed");
		}
	}

	private byte[] aad(String key, UUID property, UUID invitation) {
		return ("moahome:resident-invitation:v1:" + key + ":" + property + ":" + invitation)
		    .getBytes(StandardCharsets.UTF_8);
	}
}
