package com.moahome.server.auth.domain;

import java.time.OffsetDateTime;

import com.moahome.server.user.domain.User;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SocialAccountTest {
	@Test
	void linksAnActiveUserAndAllowsMissingEmail() {
		User user = User.create("사용자", null);
		VerifiedSocialProfile profile = new VerifiedSocialProfile(SocialProvider.KAKAO, "12345", null, "사용자", null);
		SocialAccount account = SocialAccount.link(user, profile);
		assertThat(account.getUser()).isSameAs(user);
		assertThat(account.getProviderUserId()).isEqualTo("12345");
		assertThat(account.getProviderEmail()).isNull();
		account.updateProviderEmail("user@example.test");
		account.delete(user.getId(), OffsetDateTime.now());
		assertThatThrownBy(() -> account.updateProviderEmail(null)).isInstanceOf(IllegalStateException.class);
		assertThatThrownBy(() -> account.delete(user.getId(), OffsetDateTime.now())).isInstanceOf(IllegalStateException.class);
		assertThat(profile.toString()).doesNotContain("12345", "사용자");
	}

	@Test
	void refusesInvalidIdentityAndCannotLinkSuspendedUser() {
		assertThatThrownBy(() -> new VerifiedSocialProfile(SocialProvider.KAKAO, " ", null, "사용자", null))
			.isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> new VerifiedSocialProfile(SocialProvider.KAKAO, "123", " ", "사용자", null))
			.isInstanceOf(IllegalArgumentException.class);
		User user = User.create("사용자", null);
		user.suspend();
		assertThatThrownBy(() -> SocialAccount.link(user,
			new VerifiedSocialProfile(SocialProvider.KAKAO, "123", null, "사용자", null)))
			.isInstanceOf(com.moahome.server.user.exception.UserException.class);
	}
}
