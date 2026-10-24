package com.moahome.server.config;

import com.moahome.server.common.security.InvitationCodeSecurity;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;

@Configuration
public class InvitationSecurityConfig {
	/** 기존 외부 키링을 사용하고 초대 전용 AAD를 적용하며 발급·재전달 때만 키를 읽습니다. */
	@Bean
	@Lazy
	InvitationCodeSecurity invitationCodeSecurity(Environment environment) {
		return new InvitationCodeSecurity(
		    Binder.get(environment).bind("moahome.account-security", AccountSecurityProperties.class).get());
	}
}
