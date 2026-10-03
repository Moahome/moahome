package com.moahome.server.user.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;

import com.moahome.server.user.domain.User;
import com.moahome.server.user.exception.UserErrorCode;
import com.moahome.server.user.exception.UserException;
import com.moahome.server.user.repo.UserRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {
	private final UserRepository users;
	private final Clock clock;

	public UserService(UserRepository users, Clock clock) {
		this.users = users;
		this.clock = clock;
	}

	@Transactional
	public User create(String displayName, String profileImageUrl) {
		return users.save(User.create(displayName, profileImageUrl));
	}

	@Transactional(readOnly = true)
	public User requireActive(UUID userId) {
		User user = users.findByIdAndDeletedAtIsNull(userId)
			.orElseThrow(() -> new UserException(UserErrorCode.USER_NOT_FOUND));
		user.requireActive();
		return user;
	}

	@Transactional
	public void recordLogin(UUID userId) {
		requireForUpdate(userId).recordLogin(OffsetDateTime.now(clock));
	}

	@Transactional
	public void suspend(UUID userId) {
		requireForUpdate(userId).suspend();
	}

	@Transactional
	public void resume(UUID userId) {
		requireForUpdate(userId).resume();
	}

	/** SocialAccountService coordinates withdrawal of the user and all social accounts. */
	@Transactional
	public void withdraw(UUID userId, UUID actorId, OffsetDateTime at) {
		requireForUpdate(userId).withdraw(actorId, at);
	}

	private User requireForUpdate(UUID userId) {
		return users.findForUpdate(userId).orElseThrow(() -> new UserException(UserErrorCode.USER_NOT_FOUND));
	}
}
