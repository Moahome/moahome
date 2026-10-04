package com.moahome.server.config;

import java.net.http.HttpClient;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.http.converter.FormHttpMessageConverter;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.keygen.Base64StringKeyGenerator;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.endpoint.RestClientAuthorizationCodeTokenResponseClient;
import org.springframework.security.oauth2.client.http.OAuth2ErrorResponseErrorHandler;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.oauth2.core.http.converter.OAuth2AccessTokenResponseHttpMessageConverter;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(KakaoOAuthProperties.class)
public class KakaoOAuthConfig {
	public static final String START_PATH = "/oauth2/authorization/kakao";
	public static final String CALLBACK_PATH = "/login/oauth2/code/kakao";

	@Bean
	ClientRegistrationRepository kakaoClientRegistrations(KakaoOAuthProperties kakao, SecurityProperties security) {
		kakao.validate(security);
		return new InMemoryClientRegistrationRepository(ClientRegistration.withRegistrationId("kakao")
			.clientId(kakao.clientId()).clientSecret(kakao.clientSecret())
			.clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_POST)
			.authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
			.clientSettings(ClientRegistration.ClientSettings.builder().requireProofKey(true).build())
			.redirectUri(kakao.redirectUri().toString()).scope("profile_nickname")
			.authorizationUri("https://kauth.kakao.com/oauth/authorize")
			.tokenUri("https://kauth.kakao.com/oauth/token")
			.userInfoUri("https://kapi.kakao.com/v2/user/me?secure_resource=true&property_keys="
				+ URLEncoder.encode("[\"kakao_account.profile\",\"kakao_account.email\"]", StandardCharsets.UTF_8))
			.userNameAttributeName("id").clientName("Kakao").build());
	}

	@Bean
	OAuth2AuthorizationRequestResolver kakaoAuthorizationResolver(ClientRegistrationRepository registrations) {
		var delegate = new DefaultOAuth2AuthorizationRequestResolver(registrations);
		var random = new Base64StringKeyGenerator(Base64.getUrlEncoder().withoutPadding(), 32);
		delegate.setAuthorizationRequestCustomizer(builder -> builder.state(random.generateKey()));
		return new OAuth2AuthorizationRequestResolver() {
			@Override
			public OAuth2AuthorizationRequest resolve(HttpServletRequest request) {
				if (!isStart(request)) {
					return null;
				}
				return withLoginPrompt(request, delegate.resolve(request));
			}

			@Override
			public OAuth2AuthorizationRequest resolve(HttpServletRequest request, String registrationId) {
				if (!isStart(request) || !"kakao".equals(registrationId)) {
					return null;
				}
				return withLoginPrompt(request, delegate.resolve(request, registrationId));
			}

			/** 계정 변경 요청에만 재인증 옵션을 적용하고 기존 state와 PKCE 검증 정보를 유지합니다. */
			private OAuth2AuthorizationRequest withLoginPrompt(HttpServletRequest request,
				OAuth2AuthorizationRequest authorization) {
				if (authorization == null || !"login".equals(request.getParameter("prompt"))) {
					return authorization;
				}
				// 공유 resolver를 변경하지 않고 요청별로 복사하며, 임의의 카카오 옵션은 전달하지 않습니다.
				return OAuth2AuthorizationRequest.from(authorization)
					.additionalParameters(parameters -> parameters.put("prompt", "login")).build();
			}

			private boolean isStart(HttpServletRequest request) {
				return "GET".equals(request.getMethod())
					&& START_PATH.equals(request.getRequestURI().substring(request.getContextPath().length()));
			}
		};
	}

	@Bean
	RestClient kakaoRestClient() {
		var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build());
		factory.setReadTimeout(Duration.ofSeconds(5));
		return RestClient.builder().requestFactory(factory).build();
	}

	@Bean
	RestClientAuthorizationCodeTokenResponseClient kakaoTokenClient(RestClient kakaoRestClient) {
		var client = new RestClientAuthorizationCodeTokenResponseClient();
		client.setRestClient(kakaoRestClient.mutate().configureMessageConverters(converters -> {
			converters.addCustomConverter(new FormHttpMessageConverter());
			converters.addCustomConverter(new OAuth2AccessTokenResponseHttpMessageConverter());
		}).defaultStatusHandler(new OAuth2ErrorResponseErrorHandler()).build());
		return client;
	}

	/** Kakao tokens are used for verification during this request only. */
	@Bean
	OAuth2AuthorizedClientRepository kakaoAuthorizedClients() {
		return new OAuth2AuthorizedClientRepository() {
			@Override
			public <T extends OAuth2AuthorizedClient> T loadAuthorizedClient(String registrationId, Authentication principal,
				HttpServletRequest request) {
				return null;
			}

			@Override
			public void saveAuthorizedClient(OAuth2AuthorizedClient client, Authentication principal,
				HttpServletRequest request, HttpServletResponse response) {
			}

			@Override
			public void removeAuthorizedClient(String registrationId, Authentication principal,
				HttpServletRequest request, HttpServletResponse response) {
			}
		};
	}
}
