package com.moahome.server.property.service;

import java.util.UUID;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.repo.PropertyRepository;

public final class ManagementWriteAccess {

	private ManagementWriteAccess() {
	}

	/** 호출자의 쓰기 트랜잭션에서 ADMIN 확인 → 대상 잠금 → ADMIN 재확인을 같은 순서로 수행합니다. */
	public static void requireAdminAndLock(ManagementAccessService access, PropertyRepository properties, UUID actor,
	    UUID property) {
		requireAdmin(access, actor, property);
		properties.findForUnitUpdate(property).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		// 잠금 대기 중 계정·역할이 바뀔 수 있어 실제 변경 전에 현재 참여를 다시 조회합니다.
		requireAdmin(access, actor, property);
	}

	private static void requireAdmin(ManagementAccessService access, UUID actor, UUID property) {
		if (access.getManagementContext(actor, property).role() != PropertyMemberRole.ADMIN) {
			throw new AuthException(AuthErrorCode.ACCESS_DENIED);
		}
	}
}
