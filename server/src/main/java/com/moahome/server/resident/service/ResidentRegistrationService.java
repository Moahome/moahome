package com.moahome.server.resident.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;
import com.moahome.server.auth.exception.*;
import com.moahome.server.common.security.PhoneSecurity;
import com.moahome.server.common.validation.TextValues;
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
import java.util.List;

@Service
public class ResidentRegistrationService {
	private final ManagementAccessService access;

	private final PropertyRepository properties;

	private final UnitRepository units;

	private final BuildingRepository buildings;

	private final ResidentRepository residents;

	private final UnitResidentRepository affiliations;

	private final ResidentRegistrationResultRepository results;

	private final ObjectProvider<PhoneSecurity> phoneSecurity;

	private final Clock clock;

	public ResidentRegistrationService(ManagementAccessService access, PropertyRepository properties,
	    UnitRepository units, BuildingRepository buildings, ResidentRepository residents,
	    UnitResidentRepository affiliations, ResidentRegistrationResultRepository results,
	    ObjectProvider<PhoneSecurity> phoneSecurity, Clock clock) {
		this.access = access;
		this.properties = properties;
		this.units = units;
		this.buildings = buildings;
		this.residents = residents;
		this.affiliations = affiliations;
		this.results = results;
		this.phoneSecurity = phoneSecurity;
		this.clock = clock;
	}

	/** 관리자 확인 후 대상 잠금 안에서 명부와 현재 소속을 함께 저장하여 중복 검사·대표 지정을 직렬화합니다. */
	@Transactional
	public ResidentRegistrationResponse register(UUID userId, UUID propertyId, ResidentRegistrationRequest request) {
		access.getManagementContext(userId, propertyId);
		// 세대 추가·삭제와 같은 잠금을 사용하므로 등록 중 세대 삭제와 최초 대표 지정이 교차하지 않습니다.
		var property = properties.findForUnitUpdate(propertyId)
		    .orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		// 인계와 교차한 요청은 잠금 뒤 현재 관리자 권한으로 다시 검증합니다.
		access.getManagementContext(userId, propertyId);
		var unit = requireUnit(property, request.unitId());
		var name = TextValues.required(request.name(), 50);
		var phone = protectPhone(request.phone());
		var result = results.findById(request.requestId());
		if (result.isPresent()) {
			var saved = result.get();
			if (!saved.getPropertyId().equals(propertyId))
				throw new ResidentRegistrationException(REGISTRATION_CONFLICT);
			var resident = residents.findById(saved.getResidentId()).orElseThrow();
			return replay(resident, propertyId, request, name, phone, saved.getUnitResidentId());
		}
		// Migration 이전 요청은 주민 ID가 곧 요청 ID였으므로 기존 재시도 계약도 유지합니다.
		var previous = residents.findById(request.requestId());
		if (previous.isPresent())
			return replay(previous.get(), propertyId, request, name, phone, null);

		// 연락처 없는 동명이인과 전화번호를 공유하는 다른 이름의 가족은 이름만으로 합치지 않습니다.
		Resident resident = null;
		if (phone != null) {
			List<Resident> duplicates = residents.findByPropertyIdAndNameAndPhoneHmac(propertyId, name, phone.hmac());
			if (duplicates.stream().anyMatch(person -> person.getDeletedAt() == null))
				throw new ResidentRegistrationException(DUPLICATE_RESIDENT);
			if (duplicates.size() > 1)
				throw new ResidentRegistrationException(RESIDENT_RESTORE_REQUIRED);
			if (!duplicates.isEmpty())
				resident = duplicates.getFirst();
		}
		var at = OffsetDateTime.now(clock);
		// 과거 관계도 최초 등록 이력에 포함해 대표가 없는 기존 세대를 임의로 재지정하지 않습니다.
		boolean representative = !affiliations.existsByPropertyIdAndUnitId(propertyId, unit.getId());
		if (resident == null) {
			resident = Resident.register(request.requestId(), propertyId, name,
			    phone == null ? null : phone.encrypted(), phone == null ? null : phone.hmac(),
			    phone == null ? null : phone.last4(), at);
		} else {
			access.requireResidentWrite(userId, propertyId, resident.getUserId());
			representative = restoreResident(userId, propertyId, resident, unit, at) || representative;
		}
		residents.saveAndFlush(resident);
		var relation = UnitResident.register(resident, unit, request.relationType(), representative, at);
		affiliations.saveAndFlush(relation);
		// 주민 복구·새 관계·요청 결과가 모두 성공해야 재등록을 완료하며 중간 실패 시 전체를 롤백합니다.
		results.saveAndFlush(ResidentRegistrationResult.record(request.requestId(), resident, relation, userId, at));
		return new ResidentRegistrationResponse(resident.getId(), propertyId, unit.getId(), representative);
	}

	/** 삭제 명부를 재사용하고 새 현재 관계를 만들되 과거 퇴거·삭제 기록과 종료된 이용 권한은 보존합니다. */
	private boolean restoreResident(UUID actor, UUID propertyId, Resident resident, Unit unit, OffsetDateTime at) {
		// 이전 구현이 명부만 삭제해 남긴 현재 관계도 새 관계 저장 전에 종료합니다.
		affiliations.findByPropertyIdAndResidentIdAndStatusAndDeletedAtIsNull(propertyId, resident.getId(), "ACTIVE")
		    .ifPresent(current -> current.end(actor, at, true));
		affiliations.flush();
		var previous = affiliations.findFirstByPropertyIdAndResidentIdOrderByUpdatedAtDescIdDesc(propertyId,
		    resident.getId());
		boolean restoreRepresentative = previous
		    .filter(relation -> relation.getDeletedAt() != null && relation.getUnitId().equals(unit.getId())
		        && relation.isHouseholdRep())
		    .isPresent()
		    && affiliations.findCurrentUnitResidents(propertyId, unit.getId()).stream()
		        .noneMatch(unitResident -> unitResident.isHouseholdRep());
		resident.restore(at);
		return restoreRepresentative;
	}

	/** 같은 ID·내용의 재시도만 기존 결과로 응답하며 다른 대상·변경된 입력은 기존 명부를 덮어쓰지 않습니다. */
	private ResidentRegistrationResponse replay(Resident resident, UUID propertyId, ResidentRegistrationRequest request,
	    String name, ProtectedPhone phone, UUID expectedRelationId) {
		if (!resident.getPropertyId().equals(propertyId) || resident.getDeletedAt() != null
		    || !resident.getName().equals(name)
		    || !Objects.equals(resident.getPhoneHmac(), phone == null ? null : phone.hmac())) {
			throw new ResidentRegistrationException(REGISTRATION_CONFLICT);
		}
		var relation = affiliations
		    .findByPropertyIdAndResidentIdAndStatusAndDeletedAtIsNull(propertyId, resident.getId(), "ACTIVE")
		    .orElseThrow(() -> new ResidentRegistrationException(REGISTRATION_CONFLICT));
		// 삭제 후 새로 재등록한 관계를 과거 요청의 성공으로 오인하거나 다시 복구하지 않습니다.
		if ((expectedRelationId != null && !relation.getId().equals(expectedRelationId))
		    || !relation.getUnitId().equals(request.unitId())
		    || !relation.getRelationType().equals(request.relationType())) {
			throw new ResidentRegistrationException(REGISTRATION_CONFLICT);
		}
		return new ResidentRegistrationResponse(resident.getId(), propertyId, relation.getUnitId(),
		    relation.isHouseholdRep());
	}

	/** 관리대상에 속한 미삭제 세대와 활성 동만 선택할 수 있으며 공실 표시는 등록만으로 변경하지 않습니다. */
	Unit requireUnit(Property property, UUID unitId) {
		var unit = units.findByIdAndPropertyIdAndDeletedAtIsNull(unitId, property.getId())
		    .filter(item -> item.getStatus() != UnitStatus.INACTIVE)
		    .orElseThrow(() -> new ResidentRegistrationException(INVALID_UNIT));
		if (!property.isHasBuildings() && unit.getBuildingId() == null)
			return unit;
		if (!property.isHasBuildings() || unit.getBuildingId() == null
		    || buildings.findByIdAndPropertyIdAndDeletedAtIsNull(unit.getBuildingId(), property.getId())
		        .filter(item -> item.getStatus() == BuildingStatus.ACTIVE).isEmpty()) {
			throw new ResidentRegistrationException(INVALID_UNIT);
		}
		return unit;
	}

	/** 국내 번호는 한국 국가번호로 변환하고 국제번호는 공통 정규화기를 사용하며 원문은 저장하지 않습니다. */
	public ProtectedPhone protectPhone(String input) {
		if (input == null || input.isBlank())
			return null;
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
	public static String normalizePhone(String input) {
		String phone = input.strip();
		if (phone.length() > 64 || !phone.matches("\\+?[0-9 ()-]+"))
			throw new IllegalArgumentException("Invalid contact");
		String digits = phone.replaceAll("[ ()-]", "");
		if (digits.matches("0[1-9][0-9]{7,9}"))
			digits = "+82" + digits.substring(1);
		if (!digits.matches("\\+[1-9][0-9]{3,14}"))
			throw new IllegalArgumentException("Invalid contact");
		return digits;
	}

	public record ProtectedPhone(String encrypted, String hmac, String last4) {
		@Override
		public String toString() {
			return "ProtectedPhone[REDACTED]";
		}
	}
}
