package com.moahome.server.user.service;

import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;

import com.moahome.server.user.domain.SystemRole;
import com.moahome.server.user.domain.User;
import com.moahome.server.user.domain.UserStatus;
import com.moahome.server.user.exception.UserErrorCode;
import com.moahome.server.user.exception.UserException;
import com.moahome.server.user.repo.UserRepository;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;

class UserServiceTest {
	private final UserRepository users = mock(UserRepository.class);

	private final UserService service = new UserService(users, Clock.systemUTC(), mock(EntityManager.class));

	@Test
	void returnsLatestActiveAccountProfileAndSystemRole() {
		User user = User.create("처음 닉네임", null);
		user.updateProfile("변경한 닉네임", "https://example.test/avatar.png");
		when(users.findByIdAndDeletedAtIsNull(user.getId())).thenReturn(Optional.of(user));

		var response = service.getCurrentUser(user.getId());

		assertThat(response.id()).isEqualTo(user.getId());
		assertThat(response.displayName()).isEqualTo("변경한 닉네임");
		assertThat(response.profileImageUrl()).isEqualTo("https://example.test/avatar.png");
		assertThat(response.systemRole()).isEqualTo(SystemRole.USER);
		assertThat(response.status()).isEqualTo(UserStatus.ACTIVE);
	}

	@Test
	void allowsMissingOptionalProfileImage() {
		User user = User.create("닉네임", null);
		when(users.findByIdAndDeletedAtIsNull(user.getId())).thenReturn(Optional.of(user));

		assertThat(service.getCurrentUser(user.getId()).profileImageUrl()).isNull();
	}

	@Test
	void rejectsUnavailableAndMissingAccounts() {
		User user = User.create("닉네임", null);
		user.suspend();
		when(users.findByIdAndDeletedAtIsNull(user.getId())).thenReturn(Optional.of(user));

		assertThatThrownBy(() -> service.getCurrentUser(user.getId())).isInstanceOfSatisfying(UserException.class,
		    exception -> assertThat(exception.code()).isEqualTo(UserErrorCode.ACCOUNT_UNAVAILABLE));
		assertThatThrownBy(() -> service.getCurrentUser(UUID.randomUUID())).isInstanceOfSatisfying(UserException.class,
		    exception -> assertThat(exception.code()).isEqualTo(UserErrorCode.USER_NOT_FOUND));
	}

	@Test
	void changingOwnDisplayNamePreservesImagePlatformRoleAndCreationPermission() {
		User user = User.create("기존 이름", "https://example.test/avatar.png");
		user.promoteToSystemAdministrator();
		user.changePropertyCreationPermission(true);
		when(users.findForUpdate(user.getId())).thenReturn(Optional.of(user));

		var response = service.updateDisplayName(user.getId(), " 새 이름 ");

		assertThat(response.id()).isEqualTo(user.getId());
		assertThat(response.displayName()).isEqualTo("새 이름");
		assertThat(response.profileImageUrl()).isEqualTo("https://example.test/avatar.png");
		assertThat(response.systemRole()).isEqualTo(SystemRole.ADMIN);
		assertThat(response.canCreateProperty()).isTrue();
		assertThat(response.status()).isEqualTo(UserStatus.ACTIVE);
		verify(users).flush();
	}

	@Test
	void changingNameRejectsUnavailableMissingAndInvalidAccountsBeforeFlushing() {
		User user = User.create("기존 이름", null);
		when(users.findForUpdate(user.getId())).thenReturn(Optional.of(user));
		assertThatThrownBy(() -> service.updateDisplayName(user.getId(), " "))
		    .isInstanceOf(IllegalArgumentException.class);
		user.suspend();
		assertThatThrownBy(() -> service.updateDisplayName(user.getId(), "다른 이름"))
		    .isInstanceOf(UserException.class);
		assertThatThrownBy(() -> service.updateDisplayName(UUID.randomUUID(), "다른 이름"))
		    .isInstanceOf(UserException.class);
		assertThat(user.getDisplayName()).isEqualTo("기존 이름");
		verify(users, never()).flush();
	}
}
