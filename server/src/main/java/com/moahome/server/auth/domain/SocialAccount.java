package com.moahome.server.auth.domain;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Objects;
import java.util.UUID;

import com.moahome.server.user.domain.User;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.Getter;

@Getter
@Entity
@Table(name = "social_accounts")
public class SocialAccount {
	@Id
	@Column(nullable = false, updatable = false)
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "user_id", nullable = false, updatable = false)
	private User user;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20, updatable = false)
	private SocialProvider provider;

	@Column(name = "provider_user_id", nullable = false, length = 255, updatable = false)
	private String providerUserId;

	@Column(name = "provider_email", length = 255)
	private String providerEmail;

	@Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime updatedAt;

	@Column(name = "deleted_at", columnDefinition = "timestamptz")
	private OffsetDateTime deletedAt;

	@Column(name = "deleted_by")
	private UUID deletedBy;

	protected SocialAccount() {
	}

	private SocialAccount(User user, VerifiedSocialProfile profile) {
		Objects.requireNonNull(user, "User is required").requireActive();
		Objects.requireNonNull(profile, "Verified social profile is required");
		id = UUID.randomUUID();
		this.user = user;
		provider = profile.provider();
		providerUserId = profile.providerUserId();
		providerEmail = profile.providerEmail();
	}

	public static SocialAccount link(User user, VerifiedSocialProfile profile) {
		return new SocialAccount(user, profile);
	}

	public void updateProviderEmail(String email) {
		if (deletedAt != null) {
			throw new IllegalStateException("Deleted social account cannot be updated");
		}
		if (email != null && (email.isBlank() || email.length() > 255)) {
			throw new IllegalArgumentException("Invalid provider email");
		}
		providerEmail = email;
	}

	public void delete(UUID actorId, OffsetDateTime at) {
		if (deletedAt != null) {
			throw new IllegalStateException("Social account is already deleted");
		}
		Objects.requireNonNull(actorId, "Deletion actor is required");
		Objects.requireNonNull(at, "Deletion time is required");
		deletedAt = at;
		deletedBy = actorId;
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
