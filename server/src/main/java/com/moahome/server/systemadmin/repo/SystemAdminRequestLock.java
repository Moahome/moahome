package com.moahome.server.systemadmin.repo;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class SystemAdminRequestLock {
	private final JdbcTemplate jdbc;

	public SystemAdminRequestLock(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/** 서로 다른 회원에게 같은 요청 UUID가 동시에 제출되어도 감사 기록을 한 번만 생성합니다.
	 * 잠금은 트랜잭션 종료 시 해제되며 롤백한 요청은 권한과 감사 기록을 남기지 않습니다. */
	public void acquire(UUID requestId) {
		jdbc.queryForList("select pg_advisory_xact_lock(hashtextextended(?, 0))",
		    "moahome:system-admin:" + requestId);
	}
}
