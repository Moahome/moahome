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
	void createsActiveUserWithoutRequiringPhone() {
		User user = User.create(" 사용자 ", null);
		assertThat(user.getId()).isNotNull();
		assertThat(user.getDisplayName()).isEqualTo("사용자");
		assertThat(user.getStatus()).isEqualTo(UserStatus.ACTIVE);
		assertThat(user.getPhoneEncrypted()).isNull();
		assertThatThrownBy(() -> User.create(" ", null)).isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void replacesVerifiedPhoneAsOneOperationAndKeepsPreviousValuesOnValidationFailure() {
		User user = User.create("사용자", null);
		user.verifyPhone("encrypted", "a".repeat(64), "1234", now);
		assertThatThrownBy(() -> user.verifyPhone("new-encrypted", "invalid", "9999", now.plusDays(1)))
			.isInstanceOf(IllegalArgumentException.class);
		assertThat(user.getPhoneEncrypted()).isEqualTo("encrypted");
		assertThat(user.getPhoneLast4()).isEqualTo("1234");
		assertThat(user.getPhoneVerifiedAt()).isEqualTo(now);
		user.verifyPhone("new-encrypted", "b".repeat(64), "9999", now.plusDays(1));
		assertThat(user.getPhoneEncrypted()).isEqualTo("new-encrypted");
		assertThat(user.getPhoneHmac()).isEqualTo("b".repeat(64));
		assertThat(user.getPhoneLast4()).isEqualTo("9999");
		assertThat(user.getPhoneVerifiedAt()).isEqualTo(now.plusDays(1));
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
		assertThatThrownBy(() -> user.verifyPhone("encrypted", "a".repeat(64), "1234", now))
			.isInstanceOf(UserException.class);
	}
}
