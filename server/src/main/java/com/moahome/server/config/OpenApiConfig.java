package com.moahome.server.config;

import com.moahome.server.auth.security.WebAuthSupport;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@ConditionalOnProperty(name = "springdoc.api-docs.enabled", havingValue = "true")
public class OpenApiConfig {

	/** 실제 인증 수단을 구분해 업무 API에 Refresh 쿠키 인증이 적용된 것으로 표시하지 않습니다. */
	@Bean
	OpenAPI moahomeOpenApi() {
		return new OpenAPI()
			.info(new Info().title("모아홈 API").version("v1")
				.description("현재 구현된 인증, 사용자와 관리대상 등록 API입니다. "
					+ "업무 API는 Access Token의 Bearer 인증을 사용합니다. "
					+ "등록의 상세 계약은 docs/propertyRegistrationApi.md, 인증은 docs/securityDesign.md를 따릅니다."))
			.components(new Components()
				.addSecuritySchemes("bearerAuth", new SecurityScheme().type(SecurityScheme.Type.HTTP)
					.scheme("bearer").bearerFormat("JWT")
					.description("카카오 로그인 후 받은 Access Token을 입력합니다. Bearer 접두사는 자동으로 추가됩니다."))
				.addSecuritySchemes("webRefreshCookie", new SecurityScheme().type(SecurityScheme.Type.APIKEY)
					.in(SecurityScheme.In.COOKIE).name(WebAuthSupport.COOKIE_NAME)
					.description("로그인 시 설정된 HttpOnly Refresh 쿠키를 브라우저가 자동 전송합니다. "
						+ "Swagger에서 직접 입력할 수 없으며 같은 API 호스트에서 먼저 로그인해야 합니다.")));
	}

	/** 활성화한 문서의 GET만 공개하고, 별도 체인으로 업무 API의 JWT·쿠키·CSRF 검증을 유지합니다. */
	@Bean
	@Order(0)
	SecurityFilterChain openApiSecurityFilterChain(HttpSecurity http,
		UrlBasedCorsConfigurationSource corsConfigurationSource) throws Exception {
		return http
			.securityMatcher("/v3/api-docs", "/v3/api-docs/**", "/v3/api-docs.yaml")
			// 4000 포트의 UI에서도 문서를 읽을 수 있도록 업무 API와 같은 Origin 허용 목록을 적용합니다.
			.cors(cors -> cors.configurationSource(corsConfigurationSource))
			.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.requestCache(AbstractHttpConfigurer::disable)
			// 문서 GET은 상태를 변경하지 않으며, 다른 HTTP 메서드는 아래 인가에서 모두 거부합니다.
			.csrf(AbstractHttpConfigurer::disable)
			.authorizeHttpRequests(requests -> requests
				.requestMatchers(HttpMethod.GET, "/v3/api-docs", "/v3/api-docs/**", "/v3/api-docs.yaml").permitAll()
				.anyRequest().denyAll())
			.build();
	}
}
