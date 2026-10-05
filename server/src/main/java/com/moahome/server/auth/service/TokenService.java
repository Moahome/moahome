package com.moahome.server.auth.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.config.SecurityProperties;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Service;

@Service
public class TokenService {
	public static final Duration ACCESS_LIFETIME = Duration.ofHours(1);
	public static final Duration REFRESH_LIFETIME = Duration.ofDays(14);

	private final JwtEncoder accessEncoder;
	private final JwtEncoder refreshEncoder;
	private final JwtDecoder accessDecoder;
	private final JwtDecoder refreshDecoder;
	private final SecurityProperties properties;
	private final Clock clock;

	public TokenService(@Qualifier("jwtAccessEncoder") JwtEncoder accessEncoder,
		@Qualifier("jwtRefreshEncoder") JwtEncoder refreshEncoder,
		@Qualifier("jwtAccessDecoder") JwtDecoder accessDecoder,
		@Qualifier("jwtRefreshDecoder") JwtDecoder refreshDecoder, SecurityProperties properties, Clock clock) {
		this.accessEncoder = accessEncoder;
		this.refreshEncoder = refreshEncoder;
		this.accessDecoder = accessDecoder;
		this.refreshDecoder = refreshDecoder;
		this.properties = properties;
		this.clock = clock;
	}

	/** 같은 로그인 세션의 두 토큰을 각각 전용 키로 발급하고 Access 만료를 세션의 절대 만료 이내로 제한합니다. */
	public TokenPair issue(String userId, String sessionId, Instant sessionExpiresAt) {
		Instant now = clock.instant().truncatedTo(ChronoUnit.SECONDS);
		Instant accessExpiresAt = now.plus(ACCESS_LIFETIME);
		if (accessExpiresAt.isAfter(sessionExpiresAt)) {
			accessExpiresAt = sessionExpiresAt;
		}
		return new TokenPair(
			encode(accessEncoder, userId, sessionId, "access", now, accessExpiresAt),
			encode(refreshEncoder, userId, sessionId, "refresh", now, sessionExpiresAt),
			accessExpiresAt, sessionExpiresAt
		);
	}

	/** 업무 API는 Access 키와 종류를 모두 검증해 Refresh 토큰의 사용을 거부합니다. */
	public Jwt readAccess(String token) {
		return read(accessDecoder, token, "access", AuthErrorCode.ACCESS_TOKEN_EXPIRED);
	}

	/** 재발급과 로그아웃은 Refresh 키와 종류를 모두 검증합니다. */
	public Jwt readRefresh(String token) {
		return read(refreshDecoder, token, "refresh", AuthErrorCode.REFRESH_TOKEN_EXPIRED);
	}

	public static String hash(String token) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
				.digest(token.getBytes(StandardCharsets.UTF_8)));
		} catch (NoSuchAlgorithmException exception) {
			throw new IllegalStateException("SHA-256 is unavailable", exception);
		}
	}

	/** 선택한 종류별 서명기로 발급자, 대상, 사용자와 세션 식별자를 포함한 JWT를 생성합니다. */
	private String encode(JwtEncoder encoder, String userId, String sessionId, String type, Instant now, Instant expiresAt) {
		JwtClaimsSet claims = JwtClaimsSet.builder()
			.issuer(properties.issuer()).audience(List.of(properties.audience()))
			.subject(userId).id(UUID.randomUUID().toString()).issuedAt(now).notBefore(now)
			.expiresAt(expiresAt).claim("sid", sessionId).claim("token_type", type).build();
		JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).type("JWT").build();
		return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
	}

	/** 종류별 서명 검증 후 필수 클레임과 유효 시각을 확인하고 내부 검증 오류를 공통 인증 오류로 변환합니다. */
	private Jwt read(JwtDecoder decoder, String token, String type, AuthErrorCode expiredCode) {
		try {
			Jwt jwt = decoder.decode(token);
			Instant now = clock.instant();
			if (!properties.issuer().equals(jwt.getClaimAsString("iss"))
				|| jwt.getAudience() == null || !jwt.getAudience().contains(properties.audience())
				|| !type.equals(jwt.getClaimAsString("token_type"))
				|| !hasText(jwt.getSubject()) || !hasText(jwt.getId())
				|| !hasText(jwt.getClaimAsString("sid"))
				|| jwt.getIssuedAt() == null || jwt.getNotBefore() == null || jwt.getExpiresAt() == null
				|| jwt.getIssuedAt().isAfter(now) || jwt.getNotBefore().isAfter(now)
				|| !jwt.getExpiresAt().isAfter(jwt.getIssuedAt())) {
				throw new AuthException(AuthErrorCode.INVALID_TOKEN);
			}
			if (!jwt.getExpiresAt().isAfter(now)) {
				throw new AuthException(expiredCode);
			}
			return jwt;
		} catch (JwtException | IllegalArgumentException exception) {
			throw new AuthException(AuthErrorCode.INVALID_TOKEN);
		}
	}

	private boolean hasText(String value) {
		return value != null && !value.isBlank();
	}

	public record TokenPair(String accessToken, String refreshToken, Instant accessExpiresAt, Instant refreshExpiresAt) {
		@Override
		public String toString() {
			return "TokenPair[REDACTED]";
		}
	}
}
