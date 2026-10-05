package com.moahome.server.common.security;

import java.util.Map;
import com.moahome.server.config.AccountSecurityProperties;
import com.moahome.server.property.support.RegistrationTestKeys;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class AccountNumberSecurityTest {
	@Test
	void preservesLeadingZeroAndUsesRandomNonceWithStableLookupHash() {
		var security = new AccountNumberSecurity(RegistrationTestKeys.accountProperties());
		var first = security.protect("00012345678");
		var second = security.protect("00012345678");
		assertThat(first.encrypted()).isNotEqualTo(second.encrypted()).doesNotContain("00012345678");
		assertThat(first.hmac()).isEqualTo(second.hmac()).hasSize(64);
		assertThat(first.last4()).isEqualTo("5678");
		assertThat(security.decrypt(first.encrypted())).isEqualTo("00012345678");
		assertThat(first.toString()).doesNotContain(first.encrypted(), first.hmac());
	}

	@Test
	void decryptsOldKeyAfterRotationAndRejectsTamperingAndPhoneCiphertext() {
		String firstKey = RegistrationTestKeys.randomKey();
		String secondKey = RegistrationTestKeys.randomKey();
		String hmac = RegistrationTestKeys.randomKey();
		var old = new AccountNumberSecurity(new AccountSecurityProperties("v1", Map.of("v1", firstKey), hmac));
		String encrypted = old.protect("00012345678").encrypted();
		var rotated = new AccountNumberSecurity(new AccountSecurityProperties("v2",
			Map.of("v1", firstKey, "v2", secondKey), hmac));
		assertThat(rotated.decrypt(encrypted)).isEqualTo("00012345678");
		assertThatThrownBy(() -> rotated.decrypt(encrypted.replace("v1:", "v2:"))).isInstanceOf(IllegalArgumentException.class);
		var phone = new PhoneSecurity(new com.moahome.server.config.PhoneSecurityProperties("v1",
			Map.of("v1", firstKey), hmac));
		assertThatThrownBy(() -> old.decrypt(phone.encrypt("+821012345678"))).isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void rejectsBadKeysAndUnnormalizedNumbers() {
		String key = RegistrationTestKeys.randomKey();
		assertThatThrownBy(() -> new AccountNumberSecurity(new AccountSecurityProperties("v1", Map.of("v1", key), key)))
			.isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> new AccountNumberSecurity(new AccountSecurityProperties("v2", Map.of("v1", key), key)))
			.isInstanceOf(IllegalArgumentException.class);
		var security = new AccountNumberSecurity(RegistrationTestKeys.accountProperties());
		for (String number : new String[]{"123", "1234-5678", "１２３４", "1".repeat(51)}) {
			assertThatThrownBy(() -> security.protect(number)).isInstanceOf(IllegalArgumentException.class);
		}
	}
}
