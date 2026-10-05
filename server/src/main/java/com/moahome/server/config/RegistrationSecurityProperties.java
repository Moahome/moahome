package com.moahome.server.config;

import java.util.Map;
import jakarta.validation.constraints.*;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("moahome.registration-security")
public record RegistrationSecurityProperties(
	@NotBlank String activeKeyVersion,
	@NotEmpty Map<@NotBlank String, @NotBlank String> fingerprintKeys
) {
	@Override
	public String toString() { return "RegistrationSecurityProperties[REDACTED]"; }
}
