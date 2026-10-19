package com.moahome.server.banking.service;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import com.moahome.server.common.security.PaymentTextSecurity;

public final class BankTransactionKeys {
	private BankTransactionKeys() {
	}

	/** 입금의 기존 키를 그대로 유지하고 출금은 방향·선택 시간·잔액까지 포함해 환불 입금과 충돌을 막습니다. */
	public static String key(BankTransactionReader.Row row, PaymentTextSecurity security) {
		String value = row.reference() != null ? "reference:" + row.reference()
		    : "fallback:" + row.date() + ":" + security.nameHash(row.payer()) + ":" + row.amount().toPlainString();
		if ("EXPENSE".equals(row.direction()))
			value = "expense:" + value + ":" + row.time() + ":" + row.balance();
		try {
			return HexFormat.of()
			    .formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
		} catch (NoSuchAlgorithmException exception) {
			throw new IllegalStateException("Missing SHA-256");
		}
	}

	public static UUID previewId(String key) {
		return UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8));
	}

	/** 월이 붙은 적요의 반복 배분은 후보로만 제안하며 확정은 관리자가 선택합니다. */
	public static String ruleKey(String description, PaymentTextSecurity security) {
		String source = description.strip();
		String normalized = source.replaceFirst("^[0-9]{1,2}(월)?\\s*", "");
		// 숫자만 있는 적요도 유효한 원본이므로 월 제거로 빈 문자열이 되면 원문 키를 사용합니다.
		return security.nameHash(normalized.isBlank() ? source : normalized);
	}
}
