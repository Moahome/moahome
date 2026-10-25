package com.moahome.server.config;

import java.sql.SQLException;
import org.flywaydb.core.api.FlywayException;
import org.flywaydb.core.api.MigrationVersion;
import org.flywaydb.core.api.callback.Callback;
import org.flywaydb.core.api.callback.Context;
import org.flywaydb.core.api.callback.Event;
import org.springframework.stereotype.Component;

/** 이미 적용된 SQL의 체크섬을 보존하면서 이전 초대 암호문 CHECK와 철회의 충돌을 방지합니다. */
@Component
public class InvitationCredentialMigrationCallback implements Callback {

	private static final MigrationVersion REDIS_CREDENTIAL_VERSION = MigrationVersion.fromVersion("20261025015144");

	/** 해당 버전을 처음 적용할 때만 보정하며 검증·재시작이나 다른 Migration에는 개입하지 않습니다. */
	@Override
	public boolean supports(Event event, Context context) {
		return event == Event.BEFORE_EACH_MIGRATE && context.getMigrationInfo() != null
		    && REDIS_CREDENTIAL_VERSION.equals(context.getMigrationInfo().getVersion());
	}

	@Override
	public boolean canHandleInTransaction(Event event, Context context) {
		return true;
	}

	/** Flyway의 동일 트랜잭션에서 암호문만 먼저 비워 후속 SQL 실패 시 보정도 함께 롤백합니다. */
	@Override
	public void handle(Event event, Context context) {
		if (!supports(event, context)) return;
		try (var statement = context.getConnection().createStatement()) {
			// ISSUED의 NULL 암호문은 기존 CHECK에서도 허용됩니다. 접수·승인된 업무 이력은 변경하지 않습니다.
			statement.executeUpdate("UPDATE resident_invitations SET token_encrypted=NULL "
			    + "WHERE status='ISSUED' AND token_encrypted IS NOT NULL");
		} catch (SQLException exception) {
			throw new FlywayException("Redis 초대 이전을 위한 미사용 암호문 정리에 실패했습니다.", exception);
		}
	}

	@Override
	public String getCallbackName() {
		return "prepareInvitationCredentialsForRedis";
	}
}
