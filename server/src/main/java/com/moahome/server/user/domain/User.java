package com.moahome.server.user.domain;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Objects;
import java.util.UUID;

import com.moahome.server.user.exception.UserErrorCode;
import com.moahome.server.user.exception.UserException;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.Getter;

@Getter
@Entity
@Table(name = "users")
public class User {
	@Id
	@Column(nullable = false, updatable = false)
	private UUID id;

	@Column(name = "display_name", nullable = false, length = 50)
	private String displayName;

	@Column(name = "profile_image_url", length = 500)
	private String profileImageUrl;

	@Enumerated(EnumType.STRING)
	@Column(name = "system_role", nullable = false, length = 20)
	private SystemRole systemRole;

	@Column(name = "property_creation_allowed", nullable = false)
	private boolean propertyCreationAllowed;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private UserStatus status;

	@Column(name = "last_login_at", columnDefinition = "timestamptz")
	private OffsetDateTime lastLoginAt;

	@Column(name = "withdrawal_requested_at", columnDefinition = "timestamptz")
	private OffsetDateTime withdrawalRequestedAt;

	@Column(name = "withdrawal_expires_at", columnDefinition = "timestamptz")
	private OffsetDateTime withdrawalExpiresAt;

	@Column(name = "auth_version", nullable = false)
	private long authVersion;

	@Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime updatedAt;

	@Column(name = "deleted_at", columnDefinition = "timestamptz")
	private OffsetDateTime deletedAt;

	@Column(name = "deleted_by")
	private UUID deletedBy;

	protected User() {
	}

	private User(String displayName, String profileImageUrl) {
		validateProfile(displayName, profileImageUrl);
		id = UUID.randomUUID();
		this.displayName = displayName.strip();
		this.profileImageUrl = profileImageUrl;
		systemRole = SystemRole.USER;
		status = UserStatus.ACTIVE;
	}

	public static User create(String displayName, String profileImageUrl) {
		return new User(displayName, profileImageUrl);
	}

	/** 정상 계정에서만 검증한 표시 이름·이미지를 변경하며 주민 명부나 권한은 다루지 않습니다. */
	public void updateProfile(String displayName, String profileImageUrl) {
		requireActive();
		validateProfile(displayName, profileImageUrl);
		this.displayName = displayName.strip();
		this.profileImageUrl = profileImageUrl;
	}

	public void recordLogin(OffsetDateTime at) {
		requireActive();
		Objects.requireNonNull(at, "Login time is required");
		if (lastLoginAt == null || at.isAfter(lastLoginAt)) {
			lastLoginAt = at;
		}
	}

	/** 생성 권한은 시스템 역할과 독립적이며 기존 관리대상의 참여 권한을 변경하지 않습니다. */
	public void changePropertyCreationPermission(boolean allowed) {
		requireActive();
		propertyCreationAllowed = allowed;
	}

	/** 시스템 관리 권한만 부여하며 관리대상 생성 권한을 자동으로 열지 않습니다. */
	public void promoteToSystemAdministrator() {
		requireActive();
		systemRole = SystemRole.ADMIN;
	}

	public void suspend() {
		requireActive();
		status = UserStatus.SUSPENDED;
	}

	public void resume() {
		if (status != UserStatus.SUSPENDED || deletedAt != null) {
			throw new UserException(UserErrorCode.INVALID_STATE);
		}
		status = UserStatus.ACTIVE;
	}

	public void withdraw(UUID actorId, OffsetDateTime at) {
		if (status == UserStatus.WITHDRAWN || deletedAt != null) {
			throw new UserException(UserErrorCode.INVALID_STATE);
		}
		Objects.requireNonNull(actorId, "Withdrawal actor is required");
		Objects.requireNonNull(at, "Withdrawal time is required");
		status = UserStatus.WITHDRAWN;
		deletedAt = at;
		deletedBy = actorId;
	}

	public void requireActive() {
		if (status != UserStatus.ACTIVE || deletedAt != null) {
			throw new UserException(UserErrorCode.ACCOUNT_UNAVAILABLE);
		}
	}

	private void validateProfile(String name, String imageUrl) {
		if (name == null || name.isBlank() || name.codePointCount(0, name.length()) > 50
		    || (imageUrl != null && (imageUrl.isBlank() || imageUrl.length() > 500))) {
			throw new IllegalArgumentException("Invalid user profile");
		}
	}

	/** 30일간 개인정보·참여를 보관하되 기존 모든 기기의 세션은 영구 무효화합니다. */
	public void requestWithdrawal(OffsetDateTime at) {
		requireActive();
		withdrawalRequestedAt = Objects.requireNonNull(at);
		withdrawalExpiresAt = at.plusDays(30);
		authVersion = Math.addExact(authVersion, 1);
		status = UserStatus.WITHDRAWAL_PENDING;
	}

	public boolean isRecoverable(OffsetDateTime at) {
		return status == UserStatus.WITHDRAWAL_PENDING && deletedAt == null
		    && withdrawalExpiresAt != null && at.isBefore(withdrawalExpiresAt);
	}

	/** 계정만 정상화하며 유예 중 종료·회수된 참여 권한은 다시 만들지 않습니다. */
	public void recoverWithdrawal(OffsetDateTime at) {
		if (!isRecoverable(at)) {
			throw new UserException(UserErrorCode.INVALID_STATE);
		}
		status = UserStatus.ACTIVE;
		withdrawalRequestedAt = null;
		withdrawalExpiresAt = null;
	}

	/** 기한 만료 후 이름·사진·플랫폼 권한을 제거하고 업무 FK에 필요한 최소 계정 행만 남깁니다. */
	public void completeWithdrawal(OffsetDateTime at) {
		if (status != UserStatus.WITHDRAWAL_PENDING || withdrawalExpiresAt == null || at.isBefore(withdrawalExpiresAt)) {
			throw new UserException(UserErrorCode.INVALID_STATE);
		}
		withdraw(id, at);
		displayName = "탈퇴한 사용자";
		profileImageUrl = null;
		systemRole = SystemRole.USER;
		propertyCreationAllowed = false;
		lastLoginAt = null;
		withdrawalRequestedAt = null;
		withdrawalExpiresAt = null;
		authVersion = Math.addExact(authVersion, 1);
	}

	@PrePersist
	private void initializeTimestamps() {
		OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
		createdAt = now;
		updatedAt = now;
	}

	@PreUpdate
	private void updateTimestamp() {
		updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
	}
}
