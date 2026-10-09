package com.moahome.server.property.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.membership.repo.PropertyMemberRepository;
import com.moahome.server.membership.repo.PropertyMemberRepository.ManagementProperty;
import com.moahome.server.property.dto.ManagedPropertiesResponse;
import com.moahome.server.property.dto.ManagementPropertyResponse;
import com.moahome.server.user.service.UserService;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ManagementAccessService {
	private final UserService users;
	private final PropertyMemberRepository members;

	public ManagementAccessService(UserService users, PropertyMemberRepository members) {
		this.users = users;
		this.members = members;
	}

	/** 정상 계정의 현재 관리자 참여만 조회하며 조회 실패를 대상 없음으로 처리하지 않습니다. */
	public ManagedPropertiesResponse getManagedProperties(UUID userId) {
		requireActiveAccount(userId);
		return new ManagedPropertiesResponse(uniqueProperties(members.findManagedProperties(userId)));
	}

	/** 존재하지 않거나 권한이 없는 대상은 같은 오류로 거부해 다른 대상의 정보를 노출하지 않습니다. */
	public ManagementPropertyResponse getManagementContext(UUID userId, UUID propertyId) {
		requireActiveAccount(userId);
		var properties = uniqueProperties(members.findManagementContext(userId, propertyId));
		if (properties.isEmpty()) throw new AuthException(AuthErrorCode.ACCESS_DENIED);
		return properties.getFirst();
	}

	/** 계정 확인 저장소 장애는 업무 목록 조회 장애와 구분해 기존 인증 오류로 전달합니다. */
	private void requireActiveAccount(UUID userId) {
		try {
			users.requireActive(userId);
		} catch (DataAccessException exception) {
			throw new AuthException(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE);
		}
	}

	/** 동일 역할의 중복은 한 대상으로 표시하고 역할 충돌은 임의의 우선순위를 선택하지 않고 실패시킵니다. */
	private List<ManagementPropertyResponse> uniqueProperties(List<ManagementProperty> rows) {
		var properties = new LinkedHashMap<UUID, ManagementPropertyResponse>();
		for (var row : rows) {
			var current = new ManagementPropertyResponse(row.getPropertyId(), row.getName(), row.getRole());
			var previous = properties.putIfAbsent(current.propertyId(), current);
			if (previous != null && previous.role() != current.role()) {
				throw new IllegalStateException("Conflicting current management roles");
			}
		}
		return List.copyOf(properties.values());
	}
}
