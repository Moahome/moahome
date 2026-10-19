package com.moahome.server.property.service;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import com.moahome.server.config.RegistrationSecurityProperties;
import com.moahome.server.property.dto.PropertyRegistrationRequest;
import tools.jackson.databind.ObjectMapper;

public class RegistrationFingerprint {
	private final String activeKeyVersion;

	private final Map<String, SecretKey> keys;

	private final ObjectMapper mapper;

	public RegistrationFingerprint(RegistrationSecurityProperties properties, ObjectMapper mapper) {
		activeKeyVersion = properties.activeKeyVersion();
		this.mapper = mapper;
		Map<String, SecretKey> decoded = new HashMap<>();
		properties.fingerprintKeys().forEach((version, encoded) -> {
			if (!version.matches("[A-Za-z0-9_-]{1,30}")) {
				throw new IllegalArgumentException("Invalid fingerprint key version");
			}
			try {
				byte[] bytes = Base64.getDecoder().decode(encoded);
				if (bytes.length != 32) {
					throw new IllegalArgumentException();
				}
				decoded.put(version, new SecretKeySpec(bytes, "HmacSHA256"));
			} catch (IllegalArgumentException exception) {
				throw new IllegalArgumentException("Fingerprint keys must be Base64 encoded 32-byte random keys");
			}
		});
		if (!decoded.containsKey(activeKeyVersion)) {
			throw new IllegalArgumentException("Active fingerprint key is not configured");
		}
		keys = Map.copyOf(decoded);
	}

	public String activeKeyVersion() {
		return activeKeyVersion;
	}

	/** requestId를 제외한 정규화 DTO를 직렬화하여 객체 키 순서는 무시하고 배열 순서는 보존합니다. */
	public String create(PropertyRegistrationRequest request, String version) {
		SecretKey key = keys.get(version);
		if (key == null) {
			throw new IllegalStateException("Registration fingerprint key is unavailable");
		}
		try {
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(key);
			mac.update("moahome:property-registration:v1:".getBytes(StandardCharsets.UTF_8));
			// 고정된 필드 순서와 null 표현을 사용해 입력 JSON의 표현 차이를 제거합니다.
			ArrayList<Object> fields = new ArrayList<Object>(List.of(request.basicInfo(), request.buildings(),
			    request.units(), request.bankAccounts(), request.feeItems()));
			// 생략된 이전 요청은 원래 지문을 유지하고 새 거주 선택과 명부 입력은 지문에 포함해 재시도로 바뀌지 않게 합니다.
			if (request.administrator() != null)
				fields.add(request.administrator());
			// 이전 요청의 지문은 보존하고 새 인계 금액·날짜도 같은 요청 ID에서 변경하지 못하게 합니다.
			if (request.openingBalances() != null)
				fields.add(request.openingBalances());
			byte[] payload = mapper.writeValueAsBytes(fields);
			return HexFormat.of().formatHex(mac.doFinal(payload));
		} catch (GeneralSecurityException exception) {
			throw new IllegalStateException("Registration fingerprint failed");
		}
	}

	public boolean matches(String expected, PropertyRegistrationRequest request, String version) {
		return MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII),
		    create(request, version).getBytes(StandardCharsets.US_ASCII));
	}
}
