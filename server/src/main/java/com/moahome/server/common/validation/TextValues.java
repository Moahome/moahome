package com.moahome.server.common.validation;

/** API와 Entity에서 동일한 공백 정리와 Unicode 코드 포인트 길이를 사용합니다. */
public final class TextValues {
	private TextValues() {
	}

	public static String strip(String value) {
		return value == null ? null : value.strip();
	}

	public static String optional(String value) {
		String normalized = strip(value);
		return normalized == null || normalized.isEmpty() ? null : normalized;
	}

	public static boolean valid(String value, int max, boolean optional) {
		return value == null ? optional : !value.isBlank() && value.codePointCount(0, value.length()) <= max;
	}

	/** 생성 시 필수값과 길이를 확인해 HTTP 검증을 우회한 잘못된 객체도 차단합니다. */
	public static String required(String value, int max) {
		String normalized = strip(value);
		if (!valid(normalized, max, false)) {
			throw new IllegalArgumentException("Invalid required text");
		}
		return normalized;
	}

	public static String optional(String value, int max) {
		String normalized = optional(value);
		if (!valid(normalized, max, true)) {
			throw new IllegalArgumentException("Invalid optional text");
		}
		return normalized;
	}
}
