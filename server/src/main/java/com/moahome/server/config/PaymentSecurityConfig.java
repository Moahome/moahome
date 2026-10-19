package com.moahome.server.config;

import com.moahome.server.common.security.PaymentTextSecurity;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;

@Configuration
public class PaymentSecurityConfig {
	/** 기존 계좌 보안 키를 사용하되 입금 용도 AAD·HMAC 도메인을 분리하고 실제 개인정보 처리 시 검증합니다. */
	@Bean
	@Lazy
	PaymentTextSecurity paymentTextSecurity(Environment environment) {
		return new PaymentTextSecurity(
		    Binder.get(environment).bind("moahome.account-security", AccountSecurityProperties.class).get());
	}
}
