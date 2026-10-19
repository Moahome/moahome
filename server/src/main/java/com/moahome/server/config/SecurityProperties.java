package com.moahome.server.config;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("moahome.security")
public record SecurityProperties(@NotBlank String jwtAccessSecretBase64, @NotBlank String jwtRefreshSecretBase64,
    @NotBlank String issuer, @NotBlank String audience, @NotEmpty List<@NotBlank String> allowedOrigins,
    boolean cookieSecure) {
	@Override
	public String toString() {
		return "SecurityProperties[jwtAccessSecretBase64=REDACTED, jwtRefreshSecretBase64=REDACTED, issuer=" + issuer
		    + ", audience=" + audience + "]";
	}
}
