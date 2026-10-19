package com.moahome.server.config;

import java.util.Map;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("moahome.phone-security")
public record PhoneSecurityProperties(@NotBlank String activeKeyId,
    @NotEmpty Map<@NotBlank String, @NotBlank String> encryptionKeys, @NotBlank String hmacKeyBase64) {
	@Override
	public String toString() {
		return "PhoneSecurityProperties[REDACTED]";
	}
}
