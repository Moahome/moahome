package com.moahome.server.auth;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;

import javax.crypto.spec.SecretKeySpec;

import com.moahome.server.config.SecurityProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TokenServiceTest {
	private final Instant now = Instant.parse("2026-10-03T00:00:00Z");
	private MutableClock clock;
	private TokenService tokens;
	private NimbusJwtEncoder encoder;

	@BeforeEach
	void setUp() {
		byte[] bytes = new byte[32];
		new SecureRandom().nextBytes(bytes);
		SecretKeySpec key = new SecretKeySpec(bytes, "HmacSHA256");
		encoder = NimbusJwtEncoder.withSecretKey(key).algorithm(MacAlgorithm.HS256).build();
		NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
		decoder.setJwtValidator(jwt -> OAuth2TokenValidatorResult.success());
		clock = new MutableClock(now);
		tokens = new TokenService(encoder, decoder,
			new SecurityProperties(Base64.getEncoder().encodeToString(bytes), "moahome-server", "moahome-api",
				List.of("http://localhost:3000"), true), clock);
	}

	@Test
	void issuesOneHourAccessAndFourteenDayRefreshWithDifferentTypes() {
		var pair = tokens.issue("user-1", "session-1", now.plus(Duration.ofDays(14)));
		assertThat(tokens.readAccess(pair.accessToken()).getExpiresAt()).isEqualTo(now.plus(Duration.ofHours(1)));
		assertThat(tokens.readRefresh(pair.refreshToken()).getExpiresAt()).isEqualTo(now.plus(Duration.ofDays(14)));
		assertCode(() -> tokens.readAccess(pair.refreshToken()), AuthErrorCode.INVALID_TOKEN);
		assertCode(() -> tokens.readRefresh(pair.accessToken()), AuthErrorCode.INVALID_TOKEN);
	}

	@Test
	void rejectsExpiredAndTamperedTokens() {
		var pair = tokens.issue("user-1", "session-1", now.plus(Duration.ofDays(14)));
		String token = pair.accessToken();
		String[] parts = token.split("\\.");
		String tampered = parts[0] + "." + parts[1] + "." + (parts[2].startsWith("A") ? "B" : "A") + parts[2].substring(1);
		assertCode(() -> tokens.readAccess(tampered), AuthErrorCode.INVALID_TOKEN);
		clock.advance(Duration.ofHours(1));
		assertCode(() -> tokens.readAccess(token), AuthErrorCode.ACCESS_TOKEN_EXPIRED);
		clock.set(now.plus(Duration.ofDays(14)));
		assertCode(() -> tokens.readRefresh(pair.refreshToken()), AuthErrorCode.REFRESH_TOKEN_EXPIRED);
	}

	@Test
	void capsAccessAtAbsoluteSessionExpiry() {
		var pair = tokens.issue("user-1", "session-1", now.plusSeconds(10));
		assertThat(pair.accessExpiresAt()).isEqualTo(now.plusSeconds(10));
	}

	@Test
	void rejectsWrongIssuerAudienceMissingClaimsAndFutureTokens() {
		assertCode(() -> tokens.readAccess(signed("wrong", List.of("moahome-api"), now, true)), AuthErrorCode.INVALID_TOKEN);
		assertCode(() -> tokens.readAccess(signed("moahome-server", List.of("wrong"), now, true)), AuthErrorCode.INVALID_TOKEN);
		assertCode(() -> tokens.readAccess(signed("moahome-server", List.of("moahome-api"), now, false)), AuthErrorCode.INVALID_TOKEN);
		assertCode(() -> tokens.readAccess(signed("moahome-server", List.of("moahome-api"), now.plusSeconds(1), true)),
			AuthErrorCode.INVALID_TOKEN);
	}

	@Test
	void rejectsMissingAudienceAndExpiryRatherThanTreatingThemAsValidTokens() {
		for (boolean includeAudience : List.of(true, false)) {
			var builder = JwtClaimsSet.builder().issuer("moahome-server").subject("user-1").id("token-1")
				.issuedAt(now).notBefore(now).claim("token_type", "access").claim("sid", "session-1");
			if (includeAudience) {
				builder.audience(List.of("moahome-api"));
			} else {
				builder.expiresAt(now.plusSeconds(60));
			}
			String token = encoder.encode(JwtEncoderParameters.from(
				JwsHeader.with(MacAlgorithm.HS256).type("JWT").build(), builder.build())).getTokenValue();
			assertCode(() -> tokens.readAccess(token), AuthErrorCode.INVALID_TOKEN);
		}
	}

	private String signed(String issuer, List<String> audience, Instant issuedAt, boolean includeSession) {
		var builder = JwtClaimsSet.builder().issuer(issuer).audience(audience).subject("user-1").id("token-1")
			.issuedAt(issuedAt).notBefore(issuedAt).expiresAt(issuedAt.plusSeconds(60)).claim("token_type", "access");
		if (includeSession) {
			builder.claim("sid", "session-1");
		}
		return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).type("JWT").build(), builder.build()))
			.getTokenValue();
	}

	private void assertCode(Runnable action, AuthErrorCode code) {
		assertThatThrownBy(action::run).isInstanceOfSatisfying(AuthException.class,
			exception -> assertThat(exception.code()).isEqualTo(code));
	}
}
