package com.moahome.server.user.domain;

import java.time.OffsetDateTime;

import com.moahome.server.user.exception.UserErrorCode;
import com.moahome.server.user.exception.UserException;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UserTest {
	private final OffsetDateTime now = OffsetDateTime.parse("2026-10-03T08:00:00Z");

	@Test
	void createsActiveUserWithSocialProfile() {
		User user = User.create(" 사용자 ", null);
		assertThat(user.getId()).isNotNull();
		assertThat(user.getDisplayName()).isEqualTo("사용자");
		assertThat(user.getStatus()).isEqualTo(UserStatus.ACTIVE);
		assertThat(user.getSystemRole()).isEqualTo(SystemRole.USER);
		assertThatThrownBy(() -> User.create(" ", null)).isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void suspendedAndWithdrawnUsersCannotLoginAndWithdrawnUserCannotResume() {
		User user = User.create("사용자", null);
		user.recordLogin(now);
		user.recordLogin(now.minusDays(1));
		assertThat(user.getLastLoginAt()).isEqualTo(now);
		user.suspend();
		assertUnavailable(user);
		user.resume();
		user.recordLogin(now.plusHours(1));
		user.withdraw(user.getId(), now.plusDays(1));
		assertThat(user.getStatus()).isEqualTo(UserStatus.WITHDRAWN);
		assertThat(user.getDeletedBy()).isEqualTo(user.getId());
		assertThat(user.getDeletedAt()).isEqualTo(now.plusDays(1));
		assertUnavailable(user);
		assertThatThrownBy(user::resume).isInstanceOf(UserException.class);
		assertThatThrownBy(() -> user.withdraw(user.getId(), now.plusDays(2))).isInstanceOf(UserException.class);
	}

	private void assertUnavailable(User user) {
		assertThatThrownBy(() -> user.recordLogin(now)).isInstanceOfSatisfying(UserException.class,
		    exception -> assertThat(exception.code()).isEqualTo(UserErrorCode.ACCOUNT_UNAVAILABLE));
	}

	@Test
	void withdrawalKeepsProfileForThirtyDaysAndRecoveryDoesNotReviveOldAuthenticationVersion() {
		User user = User.create("보관할 이름", "https://example.test/photo.png");
		user.requestWithdrawal(now);
		assertThat(user.getStatus()).isEqualTo(UserStatus.WITHDRAWAL_PENDING);
		assertThat(user.getWithdrawalExpiresAt()).isEqualTo(now.plusDays(30));
		assertThat(user.getDisplayName()).isEqualTo("보관할 이름");
		assertThat(user.getAuthVersion()).isEqualTo(1);
		assertUnavailable(user);
		assertThatThrownBy(() -> user.completeWithdrawal(now.plusDays(30).minusNanos(1))).isInstanceOf(UserException.class);
		user.recoverWithdrawal(now.plusDays(30).minusNanos(1));
		assertThat(user.getStatus()).isEqualTo(UserStatus.ACTIVE);
		assertThat(user.getAuthVersion()).isEqualTo(1);
		assertThat(user.getWithdrawalExpiresAt()).isNull();
		assertThat(user.getProfileImageUrl()).isEqualTo("https://example.test/photo.png");
	}

	@Test
	void exactDeadlineDisallowsRecoveryAndAllowsIrreversibleProfileErasure() {
		User user = User.create("지울 이름", "https://example.test/photo.png");
		user.promoteToSystemAdministrator();
		user.changePropertyCreationPermission(true);
		user.requestWithdrawal(now);
		assertThat(user.isRecoverable(now.plusDays(30))).isFalse();
		assertThatThrownBy(() -> user.recoverWithdrawal(now.plusDays(30))).isInstanceOf(UserException.class);
		user.completeWithdrawal(now.plusDays(30));
		assertThat(user.getStatus()).isEqualTo(UserStatus.WITHDRAWN);
		assertThat(user.getDisplayName()).isEqualTo("탈퇴한 사용자");
		assertThat(user.getProfileImageUrl()).isNull();
		assertThat(user.getSystemRole()).isEqualTo(SystemRole.USER);
		assertThat(user.isPropertyCreationAllowed()).isFalse();
		assertThatThrownBy(() -> user.recoverWithdrawal(now.plusDays(30))).isInstanceOf(UserException.class);
	}
}
