package com.moahome.server.user.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.moahome.server.user.domain.User;
import com.moahome.server.user.exception.UserErrorCode;
import com.moahome.server.user.exception.UserException;
import com.moahome.server.user.repo.UserRepository;
import com.moahome.server.user.security.PhoneSecurity;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {
	private final UserRepository users;
	private final PhoneSecurity phoneSecurity;
	private final Clock clock;

	public UserService(UserRepository users, PhoneSecurity phoneSecurity, Clock clock) {
		this.users = users;
		this.phoneSecurity = phoneSecurity;
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

	/** Internal entry point: the caller must have validated a server-side phone verification result. */
	@Transactional
	public void verifyPhone(UUID userId, String verifiedPhone, OffsetDateTime verifiedAt) {
		User user = requireForUpdate(userId);
		String normalized = phoneSecurity.normalize(verifiedPhone);
		user.verifyPhone(phoneSecurity.encrypt(normalized), phoneSecurity.hmac(normalized),
			phoneSecurity.last4(normalized), verifiedAt);
	}

	@Transactional(readOnly = true)
	public List<User> findByPhone(String phone) {
		return users.findAllByPhoneHmacAndDeletedAtIsNull(phoneSecurity.hmac(phone));
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
