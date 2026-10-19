package com.moahome.server.auth.domain;

/** Created only from a provider response verified by the server, never from a client-supplied identity. */
public record VerifiedSocialProfile(SocialProvider provider, String providerUserId, String providerEmail,
    String displayName, String profileImageUrl) {
	public VerifiedSocialProfile {
		if (provider == null || providerUserId == null || providerUserId.isBlank() || providerUserId.length() > 255
		    || !providerUserId.equals(providerUserId.strip())
		    || (providerEmail != null && (providerEmail.isBlank() || providerEmail.length() > 255))) {
			throw new IllegalArgumentException("Invalid social identity");
		}
	}

	@Override
	public String toString() {
		return "VerifiedSocialProfile[REDACTED]";
	}
}
