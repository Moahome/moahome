package com.moahome.server.property.repo;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.SQLException;
import java.util.UUID;

import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.moahome.server.property.exception.*;

@Repository
public class PropertyRegistrationLock {
	private final JdbcTemplate jdbc;

	public PropertyRegistrationLock(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/** 성공 결과가 없는 최초 요청도 직렬화하며 잠금은 커밋·롤백 때 PostgreSQL이 자동 해제합니다. */
	public void acquire(UUID userId, UUID requestId) {
		String previous = jdbc.queryForObject("select current_setting('lock_timeout')", String.class);
		jdbc.queryForObject("select set_config('lock_timeout', '3s', true)", String.class);
		try {
			jdbc.query("select pg_advisory_xact_lock(?)", rs -> {
			}, key(userId, requestId));
		} catch (DataAccessException exception) {
			if (!(exception.getMostSpecificCause() instanceof SQLException sql)
			    || !"55P03".equals(sql.getSQLState())) {
				throw exception;
			}
			// 잠금 제한 시간 초과는 트랜잭션을 중단하며 처리 중 레코드나 초안을 남기지 않습니다.
			throw new RegistrationException(RegistrationErrorCode.REGISTRATION_IN_PROGRESS);
		}
		jdbc.queryForObject("select set_config('lock_timeout', ?, true)", String.class, previous);
	}

	static long key(UUID userId, UUID requestId) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256")
			    .digest(("moahome:property-registration:" + userId + ":" + requestId).getBytes(StandardCharsets.UTF_8));
			return ByteBuffer.wrap(digest).getLong();
		} catch (NoSuchAlgorithmException exception) {
			throw new IllegalStateException("Registration lock key failed");
		}
	}
}
