package com.moahome.server.config;

import com.moahome.server.common.security.PhoneSecurity;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;

@Configuration
@PropertySource("classpath:residentSecurity.properties")
public class PhoneSecurityConfig {
	/** 연락처 없는 등록·조회는 키 없이도 유지하고 연락처 저장을 처음 요청할 때 외부 키를 검증합니다. */
	@Bean
	@Lazy
	PhoneSecurity phoneSecurity(Environment environment) {
		var properties = Binder.get(environment).bind("moahome.phone-security", PhoneSecurityProperties.class).get();
		return new PhoneSecurity(properties);
	}
}
