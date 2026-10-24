package com.moahome.server.membership.domain;

import java.security.SecureRandom;
import java.util.Locale;
import com.moahome.server.auth.service.TokenService;
import com.moahome.server.payment.exception.PaymentException;

/** 혼동하기 쉬운 I·O·0·1을 제외한 60비트 코드를 만들고 표시용 구분자는 해시 전에 정규화합니다. */
public final class ResidentInviteCode {
	private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

	private static final SecureRandom RANDOM = new SecureRandom();
	private ResidentInviteCode() {
	}

	public static String create(String prefix) {
		StringBuilder result = new StringBuilder(prefix);
		for (int i = 0; i < 12; i++) {
			if (i % 4 == 0)
				result.append('-');
			result.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
		}
		return result.toString();
	}

	public static String hash(String value) {
		String normalized = value == null ? "" : value.strip().toUpperCase(Locale.ROOT).replace("-", "");
		if (!normalized.matches("[RB][A-HJ-NP-Z2-9]{12}"))
			throw new PaymentException("INVALID_INVITATION");
		return TokenService.hash(normalized);
	}
}
