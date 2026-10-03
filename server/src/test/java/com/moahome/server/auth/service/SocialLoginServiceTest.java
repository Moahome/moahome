package com.moahome.server.auth.service;

import java.util.UUID;

import com.moahome.server.auth.domain.ClientType;
import com.moahome.server.auth.domain.SocialProvider;
import com.moahome.server.auth.domain.VerifiedSocialProfile;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SocialLoginServiceTest {
	private final SocialAccountService accounts = mock(SocialAccountService.class);
	private final AuthService auth = mock(AuthService.class);
	private final SocialLoginService login = new SocialLoginService(accounts, auth);
	private final VerifiedSocialProfile profile = new VerifiedSocialProfile(SocialProvider.KAKAO, "123", null, "사용자", null);

	@Test
	void resolvesPersistedUserBeforeStartingSession() {
		UUID id = UUID.randomUUID();
		when(accounts.resolveVerifiedUser(profile)).thenReturn(id);
		login.loginVerified(profile, ClientType.WEB);
		var order = inOrder(accounts, auth);
		order.verify(accounts).resolveVerifiedUser(profile);
		order.verify(auth).startSession(id.toString(), ClientType.WEB);
	}

	@Test
	void persistenceFailureDoesNotCreateSession() {
		when(accounts.resolveVerifiedUser(profile)).thenThrow(new IllegalStateException("DB unavailable"));
		assertThatThrownBy(() -> login.loginVerified(profile, ClientType.APP)).isInstanceOf(IllegalStateException.class);
		verify(auth, never()).startSession(anyString(), any());
	}
}
