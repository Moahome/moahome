package com.moahome.server.auth.service;

import java.util.Objects;
import java.util.UUID;

import com.moahome.server.auth.domain.ClientType;
import com.moahome.server.auth.domain.VerifiedSocialProfile;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SocialLoginService {
	private final SocialAccountService socialAccounts;

	private final AuthService auth;

	public SocialLoginService(SocialAccountService socialAccounts, AuthService auth) {
		this.socialAccounts = socialAccounts;
		this.auth = auth;
	}

	/** Called only after server-side provider verification; DB commit precedes Redis session creation. */
	@Transactional(propagation = Propagation.NEVER)
	public TokenService.TokenPair loginVerified(VerifiedSocialProfile profile, ClientType clientType) {
		Objects.requireNonNull(profile, "Verified social profile is required");
		Objects.requireNonNull(clientType, "Client type is required");
		UUID userId = socialAccounts.resolveVerifiedUser(profile);
		return auth.startSession(userId.toString(), clientType);
	}

	/** 검증된 동일 소셜 계정만 정상 로그인 또는 복구 전용 로그인으로 분기합니다. */
	@Transactional(propagation = Propagation.NEVER)
	public AuthService.WebLoginResult loginWebVerified(VerifiedSocialProfile profile) {
		return auth.startWebLoginSession(socialAccounts.resolveVerifiedUser(Objects.requireNonNull(profile)));
	}
}
