package com.moahome.server.user.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;

import com.moahome.server.user.domain.User;
import com.moahome.server.user.dto.CurrentUserResponse;
import com.moahome.server.user.exception.UserErrorCode;
import com.moahome.server.user.exception.UserException;
import com.moahome.server.user.repo.UserRepository;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.exception.AuthErrorCode;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;

@Service
public class UserService {
	private final UserRepository users;

	private final Clock clock;

	private final EntityManager entityManager;

	public UserService(UserRepository users, Clock clock, EntityManager entityManager) {
		this.users = users;
		this.clock = clock;
		this.entityManager = entityManager;
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

	/** 정상 계정의 최신 프로필과 플랫폼 역할을 조회하며 관리대상 권한으로 해석하지 않습니다. */
	@Transactional(readOnly = true)
	public CurrentUserResponse getCurrentUser(UUID userId) {
		User user = requireActive(userId);
		return new CurrentUserResponse(user.getId(), user.getDisplayName(), user.getProfileImageUrl(),
		    user.getSystemRole(), user.getStatus(), user.isPropertyCreationAllowed());
	}

	/** 등록 화면의 검증·파일 미리보기에서도 현재 DB의 생성 허용 여부를 확인합니다. */
	@Transactional(readOnly = true)
	public User requirePropertyCreation(UUID userId) {
		User user = requireActive(userId);
		checkPropertyCreation(user);
		return user;
	}

	/** 최종 생성과 권한 회수는 같은 사용자 행 잠금을 사용해 회수 완료 뒤 신규 생성을 막습니다. */
	@Transactional(propagation = Propagation.MANDATORY)
	public User requirePropertyCreationForUpdate(UUID userId) {
		User user = requireForUpdate(userId);
		// 초기 계정 조회의 1차 캐시를 재사용하면 잠금 대기 중 완료된 회수를 놓치므로 DB 값을 다시 읽습니다.
		entityManager.refresh(user, LockModeType.PESSIMISTIC_WRITE);
		user.requireActive();
		checkPropertyCreation(user);
		return user;
	}

	private void checkPropertyCreation(User user) {
		if (!user.isPropertyCreationAllowed())
			throw new AuthException(AuthErrorCode.PROPERTY_CREATION_NOT_ALLOWED);
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
