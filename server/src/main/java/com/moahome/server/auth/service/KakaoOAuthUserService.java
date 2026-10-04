package com.moahome.server.auth.service;

import java.net.URI;
import java.util.Collection;
import java.util.List;
import java.util.Map;

import com.moahome.server.auth.domain.SocialProvider;
import com.moahome.server.auth.domain.VerifiedSocialProfile;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Service
public class KakaoOAuthUserService implements OAuth2UserService<OAuth2UserRequest, OAuth2User> {
	private final RestClient kakaoRestClient;

	public KakaoOAuthUserService(RestClient kakaoRestClient) {
		this.kakaoRestClient = kakaoRestClient;
	}

	@Override
	public OAuth2User loadUser(OAuth2UserRequest request) {
		if (!"kakao".equals(request.getClientRegistration().getRegistrationId())) {
			throw failure("OAUTH_PROFILE_INVALID");
		}
		Map<?, ?> response;
		try {
			response = kakaoRestClient.get().uri(URI.create(request.getClientRegistration().getProviderDetails().getUserInfoEndpoint().getUri()))
				.headers(headers -> {
					headers.setBearerAuth(request.getAccessToken().getTokenValue());
					headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
					headers.setAccept(List.of(MediaType.APPLICATION_JSON));
				})
				.retrieve().body(Map.class);
		} catch (RestClientException exception) {
			throw failure("OAUTH_PROVIDER_UNAVAILABLE");
		}
		return new KakaoUser(profile(response));
	}

	private VerifiedSocialProfile profile(Map<?, ?> response) {
		if (response == null || !(response.get("id") instanceof Number id)
			|| id.longValue() <= 0 || !(id instanceof Long || id instanceof Integer)) {
			throw failure("OAUTH_PROFILE_INVALID");
		}
		Map<?, ?> account = map(response.get("kakao_account"));
		Map<?, ?> profile = map(account.get("profile"));
		String nickname = string(profile.get("nickname"));
		String image = string(profile.get("profile_image_url"));
		String email = string(account.get("email"));
		if (nickname == null || nickname.isBlank() || nickname.codePointCount(0, nickname.length()) > 50
			|| (image != null && (image.isBlank() || image.length() > 500))
			|| (email != null && (email.isBlank() || email.length() > 255))) {
			throw failure("OAUTH_PROFILE_INVALID");
		}
		return new VerifiedSocialProfile(SocialProvider.KAKAO, Long.toString(id.longValue()), email, nickname, image);
	}

	private Map<?, ?> map(Object value) {
		return value instanceof Map<?, ?> map ? map : Map.of();
	}

	private String string(Object value) {
		return value instanceof String string ? string : null;
	}

	private OAuth2AuthenticationException failure(String code) {
		return new OAuth2AuthenticationException(new OAuth2Error(code), "Kakao user verification failed");
	}

	public record KakaoUser(VerifiedSocialProfile profile) implements OAuth2User {
		@Override
		public Map<String, Object> getAttributes() {
			return Map.of("id", profile.providerUserId());
		}

		@Override
		public Collection<? extends GrantedAuthority> getAuthorities() {
			return List.of(new SimpleGrantedAuthority("OAUTH2_USER"));
		}

		@Override
		public String getName() {
			return profile.providerUserId();
		}

		@Override
		public String toString() {
			return "KakaoUser[REDACTED]";
		}
	}
}
