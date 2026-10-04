package com.moahome.server.config;

import java.net.URI;
import java.time.Clock;
import java.util.Base64;
import java.util.List;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import com.moahome.server.auth.controller.AppAuthController;
import com.moahome.server.auth.security.AuthErrorHandler;
import com.moahome.server.auth.security.JwtAuthenticationFilter;
import com.moahome.server.auth.security.SessionCsrfTokenRepository;
import com.moahome.server.auth.security.WebAuthSupport;
import com.moahome.server.auth.security.OAuthAuthorizationRequestRepository;
import com.moahome.server.auth.security.OAuthLoginHandler;
import com.moahome.server.auth.service.KakaoOAuthUserService;
import com.moahome.server.auth.service.AuthService;

import jakarta.servlet.DispatcherType;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.ObjectPostProcessor;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.client.endpoint.RestClientAuthorizationCodeTokenResponseClient;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestRedirectFilter;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.client.web.OAuth2LoginAuthenticationFilter;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.NullSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableMethodSecurity
@EnableConfigurationProperties(SecurityProperties.class)
public class SecurityConfig {
	@Bean
	Clock securityClock() {
		return Clock.systemUTC();
	}

	@Bean
	SecretKey jwtSigningKey(SecurityProperties properties) {
		byte[] bytes;
		try {
			bytes = Base64.getDecoder().decode(properties.jwtSecretBase64());
		} catch (IllegalArgumentException exception) {
			throw new IllegalArgumentException("JWT_SECRET_BASE64 must be valid Base64");
		}
		if (bytes.length < 32) {
			throw new IllegalArgumentException("JWT_SECRET_BASE64 must contain at least 32 random bytes");
		}
		return new SecretKeySpec(bytes, "HmacSHA256");
	}

	@Bean
	JwtEncoder jwtEncoder(SecretKey jwtSigningKey) {
		return NimbusJwtEncoder.withSecretKey(jwtSigningKey).algorithm(MacAlgorithm.HS256).build();
	}

	@Bean
	JwtDecoder jwtDecoder(SecretKey jwtSigningKey) {
		NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(jwtSigningKey).macAlgorithm(MacAlgorithm.HS256).build();
		// TokenService validates required claims, issuer, audience, type and time using the shared Clock.
		decoder.setJwtValidator(jwt -> OAuth2TokenValidatorResult.success());
		return decoder;
	}

	@Bean
	UrlBasedCorsConfigurationSource corsConfigurationSource(SecurityProperties properties) {
		CorsConfiguration cors = new CorsConfiguration();
		for (String origin : properties.allowedOrigins()) {
			URI uri = URI.create(origin);
			if (origin.contains("*") || uri.getHost() == null
				|| !("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))
				|| uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
				|| (uri.getRawPath() != null && !uri.getRawPath().isEmpty())) {
				throw new IllegalArgumentException("CORS origins must be explicit web origins");
			}
		}
		cors.setAllowedOrigins(properties.allowedOrigins());
		cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
		cors.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-CSRF-TOKEN"));
		cors.setAllowCredentials(true);
		cors.setMaxAge(3600L);
		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/**", cors);
		return source;
	}

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, AuthService auth, WebAuthSupport web,
		AuthErrorHandler errors, UrlBasedCorsConfigurationSource corsConfigurationSource,
		OAuthAuthorizationRequestRepository oauthRequests, OAuthLoginHandler oauthHandler,
		OAuth2AuthorizationRequestResolver kakaoAuthorizationResolver, KakaoOAuthUserService kakaoUsers,
		RestClientAuthorizationCodeTokenResponseClient kakaoTokenClient,
		OAuth2AuthorizedClientRepository kakaoAuthorizedClients) throws Exception {
		http
			.cors(cors -> cors.configurationSource(corsConfigurationSource))
			.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.requestCache(AbstractHttpConfigurer::disable)
			.formLogin(AbstractHttpConfigurer::disable)
			.httpBasic(AbstractHttpConfigurer::disable)
			.logout(AbstractHttpConfigurer::disable)
			.oauth2Login(oauth -> oauth
				.loginPage("/login")
				.securityContextRepository(new NullSecurityContextRepository())
				.authorizedClientRepository(kakaoAuthorizedClients)
				.authorizationEndpoint(endpoint -> endpoint
					.authorizationRequestResolver(kakaoAuthorizationResolver).authorizationRequestRepository(oauthRequests))
				.tokenEndpoint(endpoint -> endpoint.accessTokenResponseClient(kakaoTokenClient))
				.userInfoEndpoint(endpoint -> endpoint.userService(kakaoUsers))
				.successHandler(oauthHandler).failureHandler(oauthHandler)
				.withObjectPostProcessor(new ObjectPostProcessor<OAuth2AuthorizationRequestRedirectFilter>() {
					@Override
					public <O extends OAuth2AuthorizationRequestRedirectFilter> O postProcess(O filter) {
						filter.setAuthenticationFailureHandler(oauthHandler);
						return filter;
					}
				})
				.withObjectPostProcessor(new ObjectPostProcessor<OAuth2LoginAuthenticationFilter>() {
					@Override
					public <O extends OAuth2LoginAuthenticationFilter> O postProcess(O filter) {
						filter.setRequiresAuthenticationRequestMatcher(PathPatternRequestMatcher.withDefaults()
							.matcher(HttpMethod.GET, KakaoOAuthConfig.CALLBACK_PATH));
						return filter;
					}
				}))
			.csrf(csrf -> csrf
				.requireCsrfProtectionMatcher(request -> WebAuthSupport.isWebAuthRequest(request)
					&& "POST".equals(request.getMethod()))
				.csrfTokenRepository(new SessionCsrfTokenRepository())
				.csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler() {
					@Override
					public String resolveCsrfTokenValue(jakarta.servlet.http.HttpServletRequest request, CsrfToken token) {
						return request.getHeader(token.getHeaderName());
					}
				}))
			.exceptionHandling(exceptions -> exceptions.authenticationEntryPoint(errors).accessDeniedHandler(errors))
			.authorizeHttpRequests(requests -> requests
				.dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
				.requestMatchers(HttpMethod.GET, KakaoOAuthConfig.START_PATH, KakaoOAuthConfig.CALLBACK_PATH).permitAll()
				.requestMatchers(HttpMethod.POST, AppAuthController.REFRESH_PATH, AppAuthController.LOGOUT_PATH).permitAll()
				.anyRequest().authenticated())
			.addFilterBefore(new JwtAuthenticationFilter(auth, web, errors), CsrfFilter.class);
		return http.build();
	}
}
