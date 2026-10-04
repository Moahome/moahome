package com.moahome.server.auth.repo;

import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.moahome.server.auth.domain.OAuthLoginAttempt;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;

import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Repository;

@Repository
public class RedisOAuthStateRepository {
	private static final String KEY_PREFIX = "auth:oauth:";
	private static final DefaultRedisScript<Long> CREATE = new DefaultRedisScript<>("""
		if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
		redis.call('HSET', KEYS[1], 'provider', 'KAKAO', 'clientType', 'WEB',
		    'browserHash', ARGV[1], 'verifier', ARGV[2], 'expiresAt', ARGV[3],
		    'clientId', ARGV[4], 'redirectUri', ARGV[5], 'authorizationUri', ARGV[6], 'scopes', ARGV[7])
		redis.call('PEXPIREAT', KEYS[1], ARGV[3])
		return 1
		""", Long.class);
	private static final String VALIDATE = """
		if redis.call('EXISTS', KEYS[1]) == 0 then return {} end
		if redis.call('HGET', KEYS[1], 'provider') ~= 'KAKAO'
		    or redis.call('HGET', KEYS[1], 'clientType') ~= 'WEB'
		    or redis.call('HGET', KEYS[1], 'browserHash') ~= ARGV[1] then return {} end
		if tonumber(redis.call('HGET', KEYS[1], 'expiresAt')) <= tonumber(ARGV[2]) then
		    redis.call('DEL', KEYS[1])
		    return {}
		end
		local fields = redis.call('HGETALL', KEYS[1])
		""";
	private static final DefaultRedisScript<List> LOAD = new DefaultRedisScript<>(VALIDATE + "return fields", List.class);
	private static final DefaultRedisScript<List> CONSUME = new DefaultRedisScript<>(
		VALIDATE + "redis.call('DEL', KEYS[1])\nreturn fields", List.class);
	private final StringRedisTemplate redis;
	private final Clock clock;

	public RedisOAuthStateRepository(StringRedisTemplate redis, Clock clock) {
		this.redis = redis;
		this.clock = clock;
	}

	public void create(OAuthLoginAttempt attempt) {
		try {
			Long result = redis.execute(CREATE, List.of(KEY_PREFIX + attempt.state()), attempt.browserHash(),
				attempt.codeVerifier(), Long.toString(attempt.expiresAt().toEpochMilli()), attempt.clientId(),
				attempt.redirectUri(), attempt.authorizationUri(), String.join(" ", attempt.scopes()));
			if (!Long.valueOf(1).equals(result)) {
				throw unavailable();
			}
		} catch (DataAccessException exception) {
			throw unavailable();
		}
	}

	public Optional<OAuthLoginAttempt> load(String state, String browserHash, boolean consume) {
		try {
			List<?> fields = redis.execute(consume ? CONSUME : LOAD, List.of(KEY_PREFIX + state),
				browserHash, Long.toString(clock.instant().toEpochMilli()));
			if (fields == null) {
				throw unavailable();
			}
			if (fields.isEmpty()) {
				return Optional.empty();
			}
			Map<String, String> values = new HashMap<>();
			for (int i = 0; i < fields.size(); i += 2) {
				values.put((String) fields.get(i), (String) fields.get(i + 1));
			}
			return Optional.of(new OAuthLoginAttempt(state, values.get("browserHash"), values.get("verifier"),
				Instant.ofEpochMilli(Long.parseLong(values.get("expiresAt"))), values.get("clientId"),
				values.get("redirectUri"), values.get("authorizationUri"), Set.of(values.get("scopes").split(" "))));
		} catch (DataAccessException | IllegalArgumentException | NullPointerException | ClassCastException exception) {
			throw unavailable();
		}
	}

	private AuthException unavailable() {
		return new AuthException(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE);
	}
}
