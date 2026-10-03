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
}
