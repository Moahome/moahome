package com.moahome.server.common.security;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.UUID;
import java.util.function.Function;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import com.moahome.server.config.PhoneSecurityProperties;
import com.moahome.server.property.support.RegistrationTestKeys;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EncryptionCompatibilityTest {

	@Test
	void readsExistingV1FormatAndProducesCiphertextReadableByThePreviousEngine() throws Exception {
		var properties = RegistrationTestKeys.accountProperties();
		var accounts = new AccountNumberSecurity(properties);
		var texts = new PaymentTextSecurity(properties);
		var phones = new PhoneSecurity(new PhoneSecurityProperties(properties.activeKeyId(),
		    properties.encryptionKeys(), properties.hmacKeyBase64()));
		var invitations = new InvitationCodeSecurity(properties);
		UUID property = UUID.randomUUID();
		UUID invitation = UUID.randomUUID();
		String keyId = properties.activeKeyId();
		SecretKeySpec key = new SecretKeySpec(Base64.getDecoder().decode(properties.encryptionKeys().get(keyId)),
		    "AES");
		verifyCompatibility(key, keyId, "moahome:bank-account:v1:" + keyId, "00012345678",
		    value -> accounts.protect(value).encrypted(), accounts::decrypt);
		verifyCompatibility(key, keyId, "moahome:payment-text:v1:" + keyId, "테스트 입금 메모",
		    value -> texts.protect(value).encrypted(), texts::decrypt);
		verifyCompatibility(key, keyId, "moahome:user:phone:v1:" + keyId, "+821012345678", phones::encrypt,
		    phones::decrypt);
		verifyCompatibility(key, keyId, "moahome:resident-invitation:v1:" + keyId + ":" + property + ":" + invitation,
		    "R-ABCD-EFGH-JKLM", value -> invitations.encrypt(property, invitation, value),
		    value -> invitations.decrypt(property, invitation, value));
		// 같은 키를 써도 업무별 AAD가 다르면 다른 용도의 암호문을 받아들이면 안 됩니다.
		assertThatThrownBy(() -> texts.decrypt(accounts.protect("00012345678").encrypted()))
		    .isInstanceOf(IllegalArgumentException.class);
		assertThat(texts.decrypt(null)).isNull();
	}

	/** 공통 엔진을 쓰지 않는 기존 JCE 처리로 저장 형식·AAD의 양방향 호환을 검증합니다. */
	private void verifyCompatibility(SecretKeySpec key, String keyId, String context, String value,
	    Function<String, String> encrypt, Function<String, String> decrypt) throws Exception {
		byte[] nonce = new byte[12];
		byte[] aad = context.getBytes(StandardCharsets.UTF_8);
		Cipher previous = Cipher.getInstance("AES/GCM/NoPadding");
		previous.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, nonce));
		previous.updateAAD(aad);
		var base64 = Base64.getUrlEncoder().withoutPadding();
		String stored = "v1:" + keyId + ":" + base64.encodeToString(nonce) + ":"
		    + base64.encodeToString(previous.doFinal(value.getBytes(StandardCharsets.UTF_8)));
		assertThat(decrypt.apply(stored)).isEqualTo(value);
		String[] parts = encrypt.apply(value).split(":", -1);
		assertThat(parts).hasSize(4);
		assertThat(parts[0]).isEqualTo("v1");
		assertThat(parts[1]).isEqualTo(keyId);
		previous.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Base64.getUrlDecoder().decode(parts[2])));
		previous.updateAAD(aad);
		assertThat(new String(previous.doFinal(Base64.getUrlDecoder().decode(parts[3])), StandardCharsets.UTF_8))
		    .isEqualTo(value);
	}
}
