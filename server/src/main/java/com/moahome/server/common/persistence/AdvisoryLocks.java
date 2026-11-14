package com.moahome.server.common.persistence;

import org.springframework.jdbc.core.JdbcTemplate;

public final class AdvisoryLocks {

	private AdvisoryLocks() {
	}

	/** 같은 트랜잭션 연결에서 기존 문자열 해시 잠금을 실행합니다. 키·제한 시간은 각 Repository가 정합니다. */
	public static void acquire(JdbcTemplate jdbc, String key) {
		jdbc.queryForList("select pg_advisory_xact_lock(hashtextextended(?, 0))", key);
	}
}
