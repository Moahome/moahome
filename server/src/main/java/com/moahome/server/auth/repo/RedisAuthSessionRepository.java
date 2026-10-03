package com.moahome.server.auth.repo;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.moahome.server.auth.domain.AuthSession;
import com.moahome.server.auth.domain.ClientType;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;

import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Repository;

@Repository
public class RedisAuthSessionRepository {
	private static final String KEY_PREFIX = "auth:session:";
	private static final DefaultRedisScript<Long> CREATE = new DefaultRedisScript<>("""
		if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
		redis.call('HSET', KEYS[1], 'userId', ARGV[1], 'clientType', ARGV[2],
		    'refreshHash', ARGV[3], 'csrfToken', ARGV[4], 'loginAt', ARGV[5], 'expiresAt', ARGV[6])
		redis.call('EXPIREAT', KEYS[1], ARGV[6])
		return 1
		""", Long.class);
	private static final String VALIDATE_REFRESH = """
		if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
		if redis.call('HGET', KEYS[1], 'userId') ~= ARGV[1]
		    or redis.call('HGET', KEYS[1], 'clientType') ~= ARGV[2] then return -2 end
		if redis.call('HGET', KEYS[1], 'refreshHash') ~= ARGV[3] then
		    redis.call('DEL', KEYS[1])
		    return -1
		end
		""";
	private static final DefaultRedisScript<Long> CHECK_REFRESH = new DefaultRedisScript<>(
		VALIDATE_REFRESH + "return 1", Long.class);
	private static final DefaultRedisScript<Long> ROTATE = new DefaultRedisScript<>(
		VALIDATE_REFRESH + "redis.call('HSET', KEYS[1], 'refreshHash', ARGV[4])\nreturn 1", Long.class);
	private static final DefaultRedisScript<Long> LOGOUT = new DefaultRedisScript<>(
		VALIDATE_REFRESH + "redis.call('DEL', KEYS[1])\nreturn 1", Long.class);

	private final StringRedisTemplate redis;

	public RedisAuthSessionRepository(StringRedisTemplate redis) {
		this.redis = redis;
	}

	public void create(AuthSession session) {
		try {
			Long result = redis.execute(CREATE, List.of(key(session.sessionId())), session.userId(),
				session.clientType().name(), session.refreshHash(), session.csrfToken(),
				Long.toString(session.loginAt().getEpochSecond()), Long.toString(session.expiresAt().getEpochSecond()));
			if (!Long.valueOf(1).equals(result)) {
				throw new AuthException(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE);
			}
		} catch (DataAccessException exception) {
			throw unavailable();
		}
	}

	public Optional<AuthSession> find(String sessionId) {
		try {
			Map<Object, Object> fields = redis.opsForHash().entries(key(sessionId));
			if (fields.isEmpty()) {
				return Optional.empty();
			}
			return Optional.of(new AuthSession(sessionId, (String) fields.get("userId"),
				ClientType.valueOf((String) fields.get("clientType")), (String) fields.get("refreshHash"),
				(String) fields.get("csrfToken"), Instant.ofEpochSecond(Long.parseLong((String) fields.get("loginAt"))),
				Instant.ofEpochSecond(Long.parseLong((String) fields.get("expiresAt")))));
		} catch (DataAccessException | IllegalArgumentException | NullPointerException exception) {
			throw unavailable();
		}
	}

	public long checkRefresh(AuthSession session, String refreshHash) {
		return execute(CHECK_REFRESH, session, refreshHash);
	}

	public long rotate(AuthSession session, String oldHash, String newHash) {
		return execute(ROTATE, session, oldHash, newHash);
	}

	public long logout(AuthSession session, String refreshHash) {
		return execute(LOGOUT, session, refreshHash);
	}

	private long execute(DefaultRedisScript<Long> script, AuthSession session, String... hashes) {
		String[] arguments = new String[hashes.length + 2];
		arguments[0] = session.userId();
		arguments[1] = session.clientType().name();
		System.arraycopy(hashes, 0, arguments, 2, hashes.length);
		try {
			Long result = redis.execute(script, List.of(key(session.sessionId())), (Object[]) arguments);
			if (result == null) {
				throw unavailable();
			}
			return result;
		} catch (DataAccessException exception) {
			throw unavailable();
		}
	}

	private String key(String sessionId) {
		return KEY_PREFIX + sessionId;
	}

	private AuthException unavailable() {
		return new AuthException(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE);
	}
}
