package com.moahome.server.config;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class KakaoOAuthPropertiesTest {
	@Test
	void acceptsExplicitHttpsAddressesAndLocalhostOnlyForLocalHttp() {
		properties("https://api.example.test/login/oauth2/code/kakao", "https://app.example.test/login/callback")
		    .validate(security(true));
		properties("http://localhost:8080/login/oauth2/code/kakao", "http://localhost:3000/login/callback")
		    .validate(security(false));
	}

	@Test
	void rejectsUntrustedOrAmbiguousRedirectsAndHttpInSecureMode() {
		for (String callback : List.of("http://localhost:8080/login/oauth2/code/kakao",
		    "https://api.example.test/wrong", "https://api.example.test/login/oauth2/code/kakao?x=1",
		    "https://user@api.example.test/login/oauth2/code/kakao",
		    "https://api.example.test/login/oauth2/code/kakao#x")) {
			assertThatThrownBy(
			    () -> properties(callback, "https://app.example.test/login/callback").validate(security(true)))
			    .isInstanceOf(IllegalArgumentException.class);
		}
		for (String success : List.of("https://evil.example/login/callback", "//app.example.test/login/callback",
		    "https://app.example.test/login/callback?next=https://evil.example",
		    "https://app.example.test/login/callback#x")) {
			assertThatThrownBy(
			    () -> properties("https://api.example.test/login/oauth2/code/kakao", success).validate(security(true)))
			    .isInstanceOf(IllegalArgumentException.class);
		}
		assertThatThrownBy(
		    () -> properties("http://127.0.0.1:8080/login/oauth2/code/kakao", "http://localhost:3000/login/callback")
		        .validate(security(false)))
		    .isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void redactsClientCredentialsFromPropertyString() {
		var properties = properties("https://api.example.test/login/oauth2/code/kakao",
		    "https://app.example.test/login/callback");
		assertThat(properties.toString()).doesNotContain(properties.clientId(), properties.clientSecret());
	}

	private KakaoOAuthProperties properties(String callback, String success) {
		return new KakaoOAuthProperties("test-client", UUID.randomUUID().toString(), URI.create(callback),
		    URI.create(success));
	}

	private SecurityProperties security(boolean secure) {
		return new SecurityProperties("unused-access", "unused-refresh", "issuer", "audience",
		    List.of("http://localhost:3000", "https://app.example.test"), secure);
	}
}
