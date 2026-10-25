package com.moahome.server.membership.repo;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.moahome.server.payment.exception.PaymentException;

/** 초대의 임시 검증값과 재전달 암호문만 TTL로 보관하고 신청·승인 원장은 DB에 유지합니다. */
@Repository
@RequiredArgsConstructor
public class RedisInvitationCodeRepository {

	public enum Kind {
		SHARED, RESIDENT, MANAGER
	}

	private static final Logger log = LoggerFactory.getLogger(RedisInvitationCodeRepository.class);

	// 값과 TTL을 한 번에 생성해 만료 없는 키가 남지 않게 합니다. 초대 ID는 재발급마다 새로 만듭니다.
	private static final DefaultRedisScript<Long> CREATE = new DefaultRedisScript<>("""
		if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
		redis.call('HSET', KEYS[1], 'property', ARGV[1], 'hash', ARGV[2],
		    'expiresAt', ARGV[3], 'encrypted', ARGV[4])
		redis.call('PEXPIRE', KEYS[1], ARGV[5])
		return 1
		""", Long.class);

	// DB 출처와 Redis의 대상·코드·기한을 함께 대조합니다. Redis 유실을 DB 해시로 우회하지 않습니다.
	private static final DefaultRedisScript<String> REQUIRE = new DefaultRedisScript<>("""
		if redis.call('EXISTS', KEYS[1]) == 0 then return nil end
		if redis.call('HGET', KEYS[1], 'property') ~= ARGV[1]
		    or redis.call('HGET', KEYS[1], 'hash') ~= ARGV[2]
		    or redis.call('HGET', KEYS[1], 'expiresAt') ~= ARGV[3] then return nil end
		if tonumber(ARGV[3]) <= tonumber(ARGV[4]) then
		    redis.call('DEL', KEYS[1])
		    return nil
		end
		return redis.call('HGET', KEYS[1], 'encrypted')
		""", String.class);

	private final StringRedisTemplate redis;

	private final Clock clock;

	/** DB 커밋 전에 검증값을 준비하며 생성 실패는 발급 전체를 롤백합니다. 확정된 생성만 롤백 시 정리합니다. */
	public void create(Kind kind, UUID id, UUID property, String hash, OffsetDateTime expiresAt, String encrypted) {
		requireTransaction();
		long ttl = Duration.between(clock.instant(), expiresAt.toInstant()).toMillis();
		if (ttl <= 0)
			throw new PaymentException("INVALID_INVITATION");
		try {
			Long result = redis.execute(CREATE, List.of(key(kind, id)), property.toString(), hash,
			    epoch(expiresAt), encrypted == null ? "" : encrypted, Long.toString(ttl));
			if (!Long.valueOf(1).equals(result))
				throw unavailable();
		} catch (DataAccessException exception) {
			// 응답 유실로 키만 생성돼도 DB 원장이 커밋되지 않으므로 사용할 수 없고 TTL 후 사라집니다.
			throw unavailable();
		}
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCompletion(int status) {
				if (status == STATUS_ROLLED_BACK)
					deleteQuietly(kind, id);
			}
		});
	}

	/** 미사용 초대는 Redis가 존재하고 DB 출처와 일치할 때만 허용하며 원문 코드는 보관하지 않습니다. */
	public String require(Kind kind, UUID id, UUID property, String hash, OffsetDateTime expiresAt) {
		try {
			String encrypted = redis.execute(REQUIRE, List.of(key(kind, id)), property.toString(), hash,
			    epoch(expiresAt), Long.toString(clock.instant().toEpochMilli()));
			if (encrypted == null)
				throw new PaymentException("INVALID_INVITATION");
			return encrypted;
		} catch (DataAccessException exception) {
			throw unavailable();
		}
	}

	/** 수락·철회가 DB에 확정된 뒤에만 코드를 지워 후반 저장 실패 시 같은 코드를 재시도할 수 있게 합니다. */
	public void deleteAfterCommit(Kind kind, UUID id) {
		requireTransaction();
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				deleteQuietly(kind, id);
			}
		});
	}

	/** 삭제 장애를 이미 커밋된 가입 실패로 응답하지 않습니다. DB 사용 상태가 재사용을 막고 TTL이 잔여 키를 정리합니다. */
	private void deleteQuietly(Kind kind, UUID id) {
		try {
			redis.delete(key(kind, id));
		} catch (DataAccessException exception) {
			log.warn("초대 검증값 정리에 실패했습니다. 종류={}, 초대ID={}; DB 상태와 TTL로 재사용을 차단합니다.", kind, id);
		}
	}

	private void requireTransaction() {
		if (!TransactionSynchronizationManager.isActualTransactionActive()
		    || !TransactionSynchronizationManager.isSynchronizationActive())
			throw new IllegalStateException("Invitation code mutations require a DB transaction");
	}

	private String key(Kind kind, UUID id) {
		return "membership:invitation:" + kind.name().toLowerCase(Locale.ROOT) + ":" + id;
	}

	private String epoch(OffsetDateTime time) {
		return Long.toString(time.toInstant().toEpochMilli());
	}

	private PaymentException unavailable() {
		return new PaymentException("INVITATION_SERVICE_UNAVAILABLE");
	}
}
