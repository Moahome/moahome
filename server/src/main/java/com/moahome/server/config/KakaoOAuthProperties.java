package com.moahome.server.config;

import java.net.URI;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("moahome.kakao")
public record KakaoOAuthProperties(@NotBlank String clientId, @NotBlank String clientSecret, @NotNull URI redirectUri,
    @NotNull URI webLoginSuccessUri) {
	public void validate(SecurityProperties security) {
		validateUri(redirectUri, security.cookieSecure());
		validateUri(webLoginSuccessUri, security.cookieSecure());
		if (!"/login/oauth2/code/kakao".equals(redirectUri.getRawPath())) {
			throw new IllegalArgumentException("KAKAO_REDIRECT_URI must use /login/oauth2/code/kakao");
		}
		String origin = webLoginSuccessUri.resolve("/").toString();
		if (!security.allowedOrigins().contains(origin.substring(0, origin.length() - 1))) {
			throw new IllegalArgumentException("WEB_LOGIN_SUCCESS_URI must use an allowed web origin");
		}
	}

	private void validateUri(URI uri, boolean secure) {
		if (uri == null || uri.getHost() == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null
		    || uri.getRawFragment() != null || !("https".equals(uri.getScheme())
		        || (!secure && "http".equals(uri.getScheme()) && "localhost".equals(uri.getHost())))) {
			throw new IllegalArgumentException(
			    "OAuth redirect addresses must be explicit HTTPS URLs; local HTTP uses localhost");
		}
	}

	@Override
	public String toString() {
		return "KakaoOAuthProperties[REDACTED]";
	}
}
