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

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private UserStatus status;

	@Column(name = "last_login_at", columnDefinition = "timestamptz")
	private OffsetDateTime lastLoginAt;

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
