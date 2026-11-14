package com.moahome.server.notice.service;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import com.moahome.server.common.security.Sha256;

@Component
public class NoticeLinkTokens {

	private final SecureRandom random = new SecureRandom();

	private final Environment environment;

	public NoticeLinkTokens(Environment environment) {
		this.environment = environment;
	}

	public String random() {
		byte[] bytes = new byte[32];
		random.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	/** 기존 HMAC 키에 공지 전용 도메인과 난수를 결합해 원문 저장 없이 같은 링크를 다시 복사합니다. */
	public String token(UUID id, String nonce) {
		try {
			byte[] key = Base64.getDecoder().decode(environment.getRequiredProperty(
			    "moahome.account-security.hmac-key-base64"));
			if (key.length != 32) {
				throw new IllegalArgumentException();
			}
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(new SecretKeySpec(key, "HmacSHA256"));
			byte[] signed = mac.doFinal(("moahome:notice-access:v1:" + id + ":" + nonce)
			    .getBytes(StandardCharsets.UTF_8));
			return id + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(signed);
		} catch (GeneralSecurityException | IllegalArgumentException | IllegalStateException exception) {
			throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
		}
	}

	/** 검증은 발급 당시 해시로 하므로 HMAC 키 교체가 이미 전달한 링크를 자동 회수하지 않습니다. */
	public boolean matches(String token, String hash) {
		return MessageDigest.isEqual(Sha256.hex(token).getBytes(StandardCharsets.US_ASCII),
		    hash.getBytes(StandardCharsets.US_ASCII));
	}
}
