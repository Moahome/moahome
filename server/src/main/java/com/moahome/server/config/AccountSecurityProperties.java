package com.moahome.server.config;

import java.util.Map;
import jakarta.validation.constraints.*;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("moahome.account-security")
public record AccountSecurityProperties(
	@NotBlank String activeKeyId,
	@NotEmpty Map<@NotBlank String, @NotBlank String> encryptionKeys,
	@NotBlank String hmacKeyBase64
) {
	@Override
	public String toString() { return "AccountSecurityProperties[REDACTED]"; }
}
