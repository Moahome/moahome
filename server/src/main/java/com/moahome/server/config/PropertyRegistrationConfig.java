package com.moahome.server.config;

import com.moahome.server.common.security.AccountNumberSecurity;
import com.moahome.server.property.service.RegistrationFingerprint;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.*;
import tools.jackson.databind.ObjectMapper;

@Configuration
@PropertySource("classpath:propertyRegistration.properties")
@EnableConfigurationProperties({ AccountSecurityProperties.class, RegistrationSecurityProperties.class })
public class PropertyRegistrationConfig {
	@Bean
	AccountNumberSecurity accountNumberSecurity(AccountSecurityProperties properties) {
		return new AccountNumberSecurity(properties);
	}

	@Bean
	RegistrationFingerprint registrationFingerprint(RegistrationSecurityProperties properties, ObjectMapper mapper) {
		return new RegistrationFingerprint(properties, mapper);
	}
}
