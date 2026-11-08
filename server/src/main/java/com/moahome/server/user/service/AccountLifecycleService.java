package com.moahome.server.user.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.service.SocialAccountService;
import com.moahome.server.membership.domain.MemberRoleEvent;
import com.moahome.server.membership.domain.PropertyMember;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.membership.repo.MemberRoleEventRepository;
import com.moahome.server.membership.repo.PropertyMemberRepository;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.user.domain.User;
import com.moahome.server.user.domain.UserStatus;
import com.moahome.server.user.dto.AccountRecoveryResponse;
import com.moahome.server.user.dto.WithdrawalReceipt;
import com.moahome.server.user.dto.WithdrawalStatus;
import com.moahome.server.user.exception.AccountLifecycleException;
import com.moahome.server.user.repo.UserRepository;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountLifecycleService {
	private final UserService users;
	private final UserRepository userRows;
	private final PropertyMemberRepository members;
	private final PropertyRepository properties;
	private final MemberRoleEventRepository events;
	private final SocialAccountService socialAccounts;
	private final ProfileImageStorage images;
	private final Clock clock;

	public AccountLifecycleService(UserService users, UserRepository userRows, PropertyMemberRepository members,
	    PropertyRepository properties, MemberRoleEventRepository events, SocialAccountService socialAccounts,
	    ProfileImageStorage images, Clock clock) {
		this.users = users;
		this.userRows = userRows;
		this.members = members;
		this.properties = properties;
		this.events = events;
		this.socialAccounts = socialAccounts;
		this.images = images;
		this.clock = clock;
	}

	/** 최종 신청에서도 재검증하며, 조회 결과만으로 관리소장의 탈퇴를 허용하지 않습니다. */
	@Transactional(readOnly = true)
	public WithdrawalStatus status(UUID userId) {
		users.requireActive(userId);
		List<WithdrawalStatus.ManagedProperty> chiefs = chiefs(userId);
		return new WithdrawalStatus(userId, chiefs.isEmpty(), chiefs);
	}

	/** 대상 → 사용자 잠금 아래 인계를 확인하고 개인정보 삭제 없이 정확히 30일 유예를 시작합니다. */
	@Transactional
	public WithdrawalReceipt request(UUID userId) {
		User user = lockAccount(userId, false);
		user.requireActive();
		requireHandoverComplete(userId);
		user.requestWithdrawal(OffsetDateTime.now(clock));
		userRows.flush();
		return new WithdrawalReceipt(user.getWithdrawalRequestedAt(), user.getWithdrawalExpiresAt());
	}

	/** 이 조회는 검증된 복구 전용 세션에서만 호출합니다. 만료 뒤에는 개인정보도 반환하지 않습니다. */
	@Transactional(readOnly = true)
	public AccountRecoveryResponse recovery(UUID userId, String csrfToken) {
		User user = userRows.findByIdAndDeletedAtIsNull(userId)
		    .orElseThrow(() -> new AuthException(AuthErrorCode.ACCOUNT_RECOVERY_EXPIRED));
		if (user.getStatus() == UserStatus.ACTIVE) {
			// DB 복구 뒤 Redis 장애가 난 경우 같은 짧은 복구 증명으로 세션 교체를 다시 시도할 수 있습니다.
			return new AccountRecoveryResponse("RESTORED", user.getDisplayName(), null, null, csrfToken);
		}
		requireRecoverable(user);
		return new AccountRecoveryResponse("PENDING", user.getDisplayName(), user.getWithdrawalRequestedAt(),
		    user.getWithdrawalExpiresAt(), csrfToken);
	}

	/** 계정 복구와 만료 삭제는 동일 사용자 잠금으로 직렬화하고 현재 참여를 자동 재생성하지 않습니다. */
	@Transactional
	public void recover(UUID userId) {
		User user = users.lockForLifecycle(userId);
		if (user.getStatus() == UserStatus.ACTIVE) {
			return;
		}
		requireRecoverable(user);
		user.recoverWithdrawal(OffsetDateTime.now(clock));
		userRows.flush();
	}

	@Transactional(readOnly = true)
	public List<UUID> expired() {
		return userRows.findExpiredWithdrawals(OffsetDateTime.now(clock), PageRequest.of(0, 20));
	}

	/** S3 삭제가 성공한 뒤 계정·소셜 개인정보를 지웁니다. 실패하면 만료 상태와 사진 참조로 재시도합니다. */
	@Transactional
	public void finalizeExpired(UUID userId) {
		if (userRows.findById(userId).filter(user -> user.getStatus() == UserStatus.WITHDRAWAL_PENDING).isEmpty()) {
			return;
		}
		User user = lockAccount(userId, true);
		OffsetDateTime at = OffsetDateTime.now(clock);
		if (user.getStatus() != UserStatus.WITHDRAWAL_PENDING || user.getWithdrawalExpiresAt() == null
		    || at.isBefore(user.getWithdrawalExpiresAt())) {
			return;
		}
		requireHandoverComplete(userId);
		images.deleteForAccountWithdrawal(userId, user.getProfileImageUrl());
		OffsetDateTime endedAt = user.getWithdrawalExpiresAt();
		for (PropertyMember member : members.findByUserIdAndDeletedAtIsNull(userId)) {
			if (!member.isCurrent()) {
				continue;
			}
			member.endForAccountWithdrawal(endedAt);
			events.save(MemberRoleEvent.record(member, member.getRole(), userId, endedAt));
		}
		socialAccounts.eraseUserIdentities(userId, at);
		user.completeWithdrawal(at);
		members.flush();
		events.flush();
		userRows.flush();
	}

	private void requireRecoverable(User user) {
		if (!user.isRecoverable(OffsetDateTime.now(clock))) {
			throw new AuthException(AuthErrorCode.ACCOUNT_RECOVERY_EXPIRED);
		}
	}

	private List<WithdrawalStatus.ManagedProperty> chiefs(UUID userId) {
		return members.findManagedProperties(userId).stream().filter(row -> row.getRole() == PropertyMemberRole.ADMIN)
		    .map(row -> new WithdrawalStatus.ManagedProperty(row.getPropertyId(), row.getName())).toList();
	}

	private void requireHandoverComplete(UUID userId) {
		if (!chiefs(userId).isEmpty()) {
			throw new AccountLifecycleException("ACCOUNT_HANDOVER_REQUIRED");
		}
	}

	/** 모든 권한 부여가 대상 → 사용자 순서를 따릅니다. 새 대상이 생겼다면 잠금 역전을 피하려고 재확인합니다. */
	private User lockAccount(UUID userId, boolean finalizing) {
		List<UUID> ids = members.findCurrentPropertyIds(userId).stream().distinct()
		    .sorted(Comparator.comparing(UUID::toString)).toList();
		for (UUID id : ids) {
			properties.findForUnitUpdate(id);
		}
		if (finalizing) {
			// 소셜 로그인도 식별자 → 사용자 순서이므로 확정 삭제에서 순서를 뒤집지 않습니다.
			socialAccounts.lockUserIdentities(userId);
		}
		User user = users.lockForLifecycle(userId);
		if (!new HashSet<>(ids).containsAll(members.findCurrentPropertyIds(userId))) {
			throw new AccountLifecycleException("ACCOUNT_PARTICIPATION_CHANGED");
		}
		return user;
	}
}
