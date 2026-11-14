package com.moahome.server.common.security;

import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** 키 선택·AAD 구성·저장 형식·입력 검증은 용도별 보안 클래스가 책임집니다. */
final class AesGcm {

	private static final SecureRandom RANDOM = new SecureRandom();

	private AesGcm() {
	}

	/** 매 암호화마다 96비트 nonce를 새로 생성해 같은 키의 nonce 재사용을 피합니다. */
	static byte[] nonce() {
		byte[] nonce = new byte[12];
		RANDOM.nextBytes(nonce);
		return nonce;
	}

	/** 기존 128비트 인증 태그와 AAD를 유지하고 실패는 호출자가 용도별 오류로 변환합니다. */
	static byte[] encrypt(SecretKey key, byte[] nonce, byte[] aad, byte[] plaintext) throws GeneralSecurityException {
		return transform(Cipher.ENCRYPT_MODE, key, nonce, aad, plaintext);
	}

	static byte[] decrypt(SecretKey key, byte[] nonce, byte[] aad, byte[] ciphertext) throws GeneralSecurityException {
		return transform(Cipher.DECRYPT_MODE, key, nonce, aad, ciphertext);
	}

	private static byte[] transform(int mode, SecretKey key, byte[] nonce, byte[] aad, byte[] value)
	    throws GeneralSecurityException {
		Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
		cipher.init(mode, key, new GCMParameterSpec(128, nonce));
		cipher.updateAAD(aad);
		return cipher.doFinal(value);
	}
}
