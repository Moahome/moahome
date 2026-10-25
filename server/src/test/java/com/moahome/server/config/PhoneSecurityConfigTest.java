package com.moahome.server.config;

import java.security.SecureRandom;
import java.util.Base64;

import org.junit.jupiter.api.Test;
import org.springframework.beans.BeansException;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import com.moahome.server.common.security.PhoneSecurity;

import static org.assertj.core.api.Assertions.*;

class PhoneSecurityConfigTest {
	private final ApplicationContextRunner context = new ApplicationContextRunner()
	    .withUserConfiguration(PhoneSecurityConfig.class);

	@Test
	void startsWithoutPhoneKeysButRefusesContactEncryptionUntilConfigured() {
		context.withPropertyValues("moahome.phone-security.active-key-id=v1",
		    "moahome.phone-security.encryption-keys.v1=", "moahome.phone-security.hmac-key-base64=")
		    .run(application -> {
			    assertThat(application.getStartupFailure()).isNull();
			    assertThatThrownBy(() -> application.getBean(PhoneSecurity.class))
			        .isInstanceOf(BeansException.class);
		    });
	}

	@Test
	void bindsIndependentExternalKeysAndRoundTripsInternationalContact() {
		context
		    .withPropertyValues("moahome.phone-security.active-key-id=v1",
		        "moahome.phone-security.encryption-keys.v1=" + key(), "moahome.phone-security.hmac-key-base64=" + key())
		    .run(application -> {
			    assertThat(application.getStartupFailure()).isNull();
			    var security = application.getBean(PhoneSecurity.class);
			    assertThat(security.decrypt(security.encrypt("+82 10 1234 5678"))).isEqualTo("+821012345678");
			    assertThat(security.last4("+821012345678")).isEqualTo("5678");
		    });
	}

	private String key() {
		var bytes = new byte[32];
		new SecureRandom().nextBytes(bytes);
		return Base64.getEncoder().encodeToString(bytes);
	}
}
