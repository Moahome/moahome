package com.moahome.server.property.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;

import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.membership.repo.PropertyMemberRepository;
import com.moahome.server.membership.repo.PropertyMemberRepository.ManagementProperty;
import com.moahome.server.property.dto.ManagedPropertiesResponse;
import com.moahome.server.property.dto.ManagementPropertyResponse;
import com.moahome.server.property.dto.PropertyAccessContextResponse;
import com.moahome.server.resident.repo.ResidentRepository;
import com.moahome.server.user.service.UserService;

@Service
@Transactional(readOnly = true)
public class ManagementAccessService {
	private final UserService users;

	private final PropertyMemberRepository members;

	private final ResidentRepository residents;

	public ManagementAccessService(UserService users, PropertyMemberRepository members, ResidentRepository residents) {
		this.users = users;
		this.members = members;
		this.residents = residents;
	}

	/** 정상 계정의 현재 관리자 참여만 조회하며 조회 실패를 대상 없음으로 처리하지 않습니다. */
	public ManagedPropertiesResponse getManagedProperties(UUID userId) {
		requireActiveAccount(userId);
		return new ManagedPropertiesResponse(uniqueProperties(members.findManagedProperties(userId)));
	}

	/** 승인으로 부여된 현재 주민 참여만 반환하며 명부 등록·신청 대기를 가입으로 간주하지 않습니다. */
	public ManagedPropertiesResponse getResidentProperties(UUID userId) {
		requireActiveAccount(userId);
		return new ManagedPropertiesResponse(uniqueProperties(members.findResidentProperties(userId)));
	}

	/** 존재하지 않거나 권한이 없는 대상은 같은 오류로 거부해 다른 대상의 정보를 노출하지 않습니다. */
	public ManagementPropertyResponse getManagementContext(UUID userId, UUID propertyId) {
		requireActiveAccount(userId);
		List<ManagementPropertyResponse> properties = uniqueProperties(
		    members.findManagementContext(userId, propertyId));
		if (properties.isEmpty())
			throw new AuthException(AuthErrorCode.ACCESS_DENIED);
		return properties.getFirst();
	}

	/** 현재 역할과 실제 주민 연결을 함께 확인하며 주민 출처가 없는 관리자를 주민으로 추정하지 않습니다. */
	public PropertyAccessContextResponse getPropertyAccessContext(UUID userId, UUID propertyId) {
		requireActiveAccount(userId);
		List<ManagementPropertyResponse> properties = uniqueProperties(members.findAccessContext(userId, propertyId));
		if (properties.isEmpty())
			throw new AuthException(AuthErrorCode.ACCESS_DENIED);
		var property = properties.getFirst();
		return new PropertyAccessContextResponse(property.propertyId(), property.name(), property.role(),
		    residents.hasApprovedResident(propertyId, userId));
	}

	/** 부담당자는 현재 관리소장의 명부를 고칠 수 없으며 대상 계정의 현재 참여로 판단합니다. */
	public void requireResidentWrite(UUID actor, UUID propertyId, UUID residentUserId) {
		var context = getManagementContext(actor, propertyId);
		if (context.role() != PropertyMemberRole.MANAGER || residentUserId == null)
			return;
		boolean chief = members.findByPropertyIdAndUserIdAndDeletedAtIsNull(propertyId, residentUserId).stream()
		    .anyMatch(member -> member.isCurrent()
		        && member.getRole() == PropertyMemberRole.ADMIN);
		if (chief)
			throw new AuthException(AuthErrorCode.ACCESS_DENIED);
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
		LinkedHashMap<UUID, ManagementPropertyResponse> properties = new LinkedHashMap<UUID, ManagementPropertyResponse>();
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
