package com.moahome.server.common.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/** 입력 구성은 호출 업무에 남기고 SHA-256 계산과 소문자 16진수 표현만 공유합니다. */
public final class Sha256 {

	private Sha256() {
	}

	public static byte[] digest(byte[] value) {
		try {
			return MessageDigest.getInstance("SHA-256").digest(value);
		} catch (NoSuchAlgorithmException exception) {
			throw new IllegalStateException("SHA-256 is unavailable", exception);
		}
	}

	public static String hex(byte[] value) {
		return HexFormat.of().formatHex(digest(value));
	}

	public static String hex(String value) {
		return hex(value.getBytes(StandardCharsets.UTF_8));
	}
}
