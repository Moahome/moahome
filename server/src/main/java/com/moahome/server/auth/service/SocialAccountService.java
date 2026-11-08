package com.moahome.server.auth.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.moahome.server.auth.domain.SocialAccount;
import com.moahome.server.auth.domain.SocialProvider;
import com.moahome.server.auth.domain.VerifiedSocialProfile;
import com.moahome.server.auth.repo.SocialAccountRepository;
import com.moahome.server.user.domain.User;
import com.moahome.server.user.domain.UserStatus;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.user.service.UserService;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SocialAccountService {
	private final SocialAccountRepository socialAccounts;

	private final UserService users;

	private final Clock clock;

	public SocialAccountService(SocialAccountRepository socialAccounts, UserService users, Clock clock) {
		this.socialAccounts = socialAccounts;
		this.users = users;
		this.clock = clock;
	}

	@Transactional
	public UUID resolveVerifiedUser(VerifiedSocialProfile profile) {
		socialAccounts.lockIdentity(identity(profile.provider(), profile.providerUserId()));
		SocialAccount account = socialAccounts.findActiveIdentity(profile.provider(), profile.providerUserId())
		    .orElseGet(() -> {
			    User user = users.create(profile.displayName(), profile.profileImageUrl());
			    return socialAccounts.save(SocialAccount.link(user, profile));
		    });
		if (account.getUser().getStatus() == UserStatus.WITHDRAWAL_PENDING) {
			if (!account.getUser().isRecoverable(OffsetDateTime.now(clock))) {
				throw new AuthException(AuthErrorCode.ACCOUNT_RECOVERY_EXPIRED);
			}
			// 제공자 본인 확인은 허용하지만 신청·기한·프로필을 로그인만으로 변경하지 않습니다.
			return account.getUser().getId();
		}
		users.recordLogin(account.getUser().getId());
		account.updateProviderEmail(profile.providerEmail());
		return account.getUser().getId();
	}

	/** Internal operation; an authorized caller must supply the actual actor. */
	@Transactional
	public void withdrawUser(UUID userId, UUID actorId) {
		List<SocialAccount> accounts = socialAccounts
		    .findAllByUserIdAndDeletedAtIsNullOrderByProviderAscProviderUserIdAsc(userId);
		for (SocialAccount account : accounts) {
			socialAccounts.lockIdentity(identity(account.getProvider(), account.getProviderUserId()));
		}
		OffsetDateTime at = OffsetDateTime.now(clock);
		users.withdraw(userId, actorId, at);
		for (SocialAccount account : accounts) {
			account.delete(actorId, at);
		}
	}

	private String identity(SocialProvider provider, String providerUserId) {
		return provider.name() + ":" + providerUserId;
	}

	/** 최종 삭제는 로그인과 동일한 소셜 식별자 잠금을 사용자 잠금보다 먼저 확보합니다. */
	@Transactional
	public void lockUserIdentities(UUID userId) {
		for (SocialAccount account : socialAccounts.findAllByUserIdAndDeletedAtIsNullOrderByProviderAscProviderUserIdAsc(userId)) {
			socialAccounts.lockIdentity(identity(account.getProvider(), account.getProviderUserId()));
		}
	}

	/** 계정 확정 삭제 뒤에도 소셜 원문 식별자·이메일을 업무 이력에 남기지 않습니다. */
	@Transactional
	public void eraseUserIdentities(UUID userId, OffsetDateTime at) {
		for (SocialAccount account : socialAccounts.findAllByUserIdAndDeletedAtIsNullOrderByProviderAscProviderUserIdAsc(userId)) {
			account.eraseForWithdrawal(userId, at);
		}
		socialAccounts.flush();
	}
}
