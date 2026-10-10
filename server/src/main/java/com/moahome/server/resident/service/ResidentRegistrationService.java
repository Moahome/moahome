package com.moahome.server.resident.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;
import com.moahome.server.auth.exception.*;
import com.moahome.server.common.security.PhoneSecurity;
import com.moahome.server.common.validation.TextValues;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.repo.*;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.resident.domain.*;
import com.moahome.server.resident.dto.*;
import com.moahome.server.resident.exception.ResidentRegistrationException;
import com.moahome.server.resident.repo.*;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static com.moahome.server.resident.exception.ResidentRegistrationException.Code.*;

@Service
public class ResidentRegistrationService {
	private final ManagementAccessService access;
	private final PropertyRepository properties;
	private final UnitRepository units;
	private final BuildingRepository buildings;
	private final ResidentRepository residents;
	private final UnitResidentRepository affiliations;
	private final ObjectProvider<PhoneSecurity> phoneSecurity;
	private final Clock clock;

	public ResidentRegistrationService(ManagementAccessService access, PropertyRepository properties, UnitRepository units,
		BuildingRepository buildings, ResidentRepository residents, UnitResidentRepository affiliations,
		ObjectProvider<PhoneSecurity> phoneSecurity, Clock clock) {
		this.access = access;
		this.properties = properties;
		this.units = units;
		this.buildings = buildings;
		this.residents = residents;
		this.affiliations = affiliations;
		this.phoneSecurity = phoneSecurity;
		this.clock = clock;
	}

	/** 관리소장 확인 후 대상 잠금 안에서 명부와 현재 소속을 함께 저장하여 중복 검사·대표 지정을 직렬화합니다. */
	@Transactional
	public ResidentRegistrationResponse register(UUID userId, UUID propertyId, ResidentRegistrationRequest request) {
		if (access.getManagementContext(userId, propertyId).role() != PropertyMemberRole.ADMIN) {
			throw new AuthException(AuthErrorCode.ACCESS_DENIED);
		}
		// 세대 추가·삭제와 같은 잠금을 사용하므로 등록 중 세대 삭제와 최초 대표 지정이 교차하지 않습니다.
		var property = properties.findForUnitUpdate(propertyId).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		var unit = requireUnit(property, request.unitId());
		var name = TextValues.required(request.name(), 50);
		var phone = protectPhone(request.phone());
		var previous = residents.findById(request.requestId());
		if (previous.isPresent()) return replay(previous.get(), propertyId, request, name, phone);

		// 연락처 없는 동명이인과 전화번호를 공유하는 다른 이름의 가족은 이름만으로 합치지 않습니다.
		if (phone != null) {
			var duplicates = residents.findByPropertyIdAndNameAndPhoneHmac(propertyId, name, phone.hmac());
			if (!duplicates.isEmpty()) {
				var code = duplicates.stream().anyMatch(person -> person.getDeletedAt() == null)
					? DUPLICATE_RESIDENT : RESIDENT_RESTORE_REQUIRED;
				throw new ResidentRegistrationException(code);
			}
		}
		var at = OffsetDateTime.now(clock);
		var resident = Resident.register(request.requestId(), propertyId, name, phone == null ? null : phone.encrypted(),
			phone == null ? null : phone.hmac(), phone == null ? null : phone.last4(), at);
		// 과거 관계도 최초 등록 이력에 포함해 대표가 없는 기존 세대를 임의로 재지정하지 않습니다.
		boolean representative = !affiliations.existsByPropertyIdAndUnitId(propertyId, unit.getId());
		residents.saveAndFlush(resident);
		affiliations.saveAndFlush(UnitResident.register(resident, unit, request.relationType(), representative, at));
		return new ResidentRegistrationResponse(resident.getId(), propertyId, unit.getId(), representative);
	}

	/** 같은 ID·내용의 재시도만 기존 결과로 응답하며 다른 대상·변경된 입력은 기존 명부를 덮어쓰지 않습니다. */
	private ResidentRegistrationResponse replay(Resident resident, UUID propertyId, ResidentRegistrationRequest request,
		String name, ProtectedPhone phone) {
		if (!resident.getPropertyId().equals(propertyId) || resident.getDeletedAt() != null || !resident.getName().equals(name)
			|| !Objects.equals(resident.getPhoneHmac(), phone == null ? null : phone.hmac())) {
			throw new ResidentRegistrationException(REGISTRATION_CONFLICT);
		}
		var relation = affiliations.findByPropertyIdAndResidentIdAndStatusAndDeletedAtIsNull(propertyId, resident.getId(), "ACTIVE")
			.orElseThrow(() -> new ResidentRegistrationException(REGISTRATION_CONFLICT));
		if (!relation.getUnitId().equals(request.unitId()) || !relation.getRelationType().equals(request.relationType())) {
			throw new ResidentRegistrationException(REGISTRATION_CONFLICT);
		}
		return new ResidentRegistrationResponse(resident.getId(), propertyId, relation.getUnitId(), relation.isHouseholdRep());
	}

	/** 관리대상에 속한 미삭제 세대와 활성 동만 선택할 수 있으며 공실 표시는 등록만으로 변경하지 않습니다. */
	Unit requireUnit(Property property, UUID unitId) {
		var unit = units.findByIdAndPropertyIdAndDeletedAtIsNull(unitId, property.getId())
			.filter(item -> item.getStatus() != UnitStatus.INACTIVE)
			.orElseThrow(() -> new ResidentRegistrationException(INVALID_UNIT));
		if (!property.isHasBuildings() && unit.getBuildingId() == null) return unit;
		if (!property.isHasBuildings() || unit.getBuildingId() == null || buildings.findByIdAndPropertyIdAndDeletedAtIsNull(unit.getBuildingId(), property.getId())
			.filter(item -> item.getStatus() == BuildingStatus.ACTIVE).isEmpty()) {
			throw new ResidentRegistrationException(INVALID_UNIT);
		}
		return unit;
	}

	/** 국내 번호는 한국 국가번호로 변환하고 국제번호는 공통 정규화기를 사용하며 원문은 저장하지 않습니다. */
	ProtectedPhone protectPhone(String input) {
		if (input == null || input.isBlank()) return null;
		String digits = normalizePhone(input);
		PhoneSecurity security;
		try {
			security = phoneSecurity.getObject();
		} catch (BeansException exception) {
			throw new ResidentRegistrationException(PHONE_SECURITY_UNAVAILABLE);
		}
		return new ProtectedPhone(security.encrypt(digits), security.hmac(digits), security.last4(digits));
	}

	/** 개별 등록과 엑셀 검증에서 동일한 국내·국제 연락처 형식을 사용합니다. */
	static String normalizePhone(String input) {
		String phone = input.strip();
		if (phone.length() > 64 || !phone.matches("\\+?[0-9 ()-]+")) throw new IllegalArgumentException("Invalid contact");
		String digits = phone.replaceAll("[ ()-]", "");
		if (digits.matches("0[1-9][0-9]{7,9}")) digits = "+82" + digits.substring(1);
		if (!digits.matches("\\+[1-9][0-9]{3,14}")) throw new IllegalArgumentException("Invalid contact");
		return digits;
	}

	record ProtectedPhone(String encrypted, String hmac, String last4) {
		@Override public String toString() { return "ProtectedPhone[REDACTED]"; }
	}
}
