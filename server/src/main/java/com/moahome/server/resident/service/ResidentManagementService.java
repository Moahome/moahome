package com.moahome.server.resident.service;

import java.time.*;
import java.util.*;
import com.moahome.server.auth.exception.*;
import com.moahome.server.common.security.PhoneSecurity;
import com.moahome.server.common.validation.TextValues;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.membership.repo.*;
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
import com.moahome.server.membership.domain.MembershipRequest;

@Service
public class ResidentManagementService {
	private final ManagementAccessService access;

	private final PropertyRepository properties;

	private final ResidentRepository residents;

	private final UnitResidentRepository affiliations;

	private final ResidentListService lists;

	private final ResidentRegistrationService registrations;

	private final PropertyMemberRepository members;

	private final MembershipRequestRepository requests;

	private final ObjectProvider<PhoneSecurity> phones;

	private final Clock clock;

	private final ObjectProvider<com.moahome.server.membership.service.MemberManagementService> roleManagement;

	public ResidentManagementService(ManagementAccessService access, PropertyRepository properties,
	    ResidentRepository residents, UnitResidentRepository affiliations, ResidentListService lists,
	    ResidentRegistrationService registrations, PropertyMemberRepository members,
	    MembershipRequestRepository requests, ObjectProvider<PhoneSecurity> phones, Clock clock,
	    ObjectProvider<com.moahome.server.membership.service.MemberManagementService> roleManagement) {
		this.access = access;
		this.properties = properties;
		this.residents = residents;
		this.affiliations = affiliations;
		this.lists = lists;
		this.registrations = registrations;
		this.members = members;
		this.requests = requests;
		this.phones = phones;
		this.clock = clock;
		this.roleManagement = roleManagement;
	}

	/** 상세 조회에서도 매번 관리소장 권한·관리대상·미삭제 명부를 확인하고 마스킹된 정보만 반환합니다. */
	@Transactional(readOnly = true)
	public ResidentDetailResponse detail(UUID actor, UUID propertyId, UUID residentId) {
		requireManagementAccess(actor, propertyId);
		var resident = requireResident(propertyId, residentId);
		var directory = lists.list(actor, propertyId);
		var row = directory.residents().stream().filter(item -> item.id().equals(residentId)).findFirst()
		    .orElseThrow(() -> failure(RESIDENT_NOT_FOUND));
		String building = directory.buildings().stream().filter(item -> item.id().equals(row.buildingId()))
		    .map(item -> item.name()).findFirst().orElse(null);
		var current = affiliations
		    .findByPropertyIdAndResidentIdAndStatusAndDeletedAtIsNull(propertyId, residentId, "ACTIVE").orElse(null);
		// 세대 삭제로 표시 동·호수가 없어도 남아 있는 관계의 대표 승계는 직접 선택할 수 있어야 합니다.
		List<UUID> candidateIds = current != null && current.isHouseholdRep()
		    ? affiliations.findCurrentUnitResidents(propertyId, current.getUnitId()).stream()
		        .map(UnitResident::getResidentId).filter(id -> !id.equals(residentId)).toList()
		    : List.<UUID>of();
		List<ResidentDetailResponse.Candidate> candidates = !candidateIds.isEmpty()
		    ? directory.residents().stream().filter(item -> candidateIds.contains(item.id()))
		        .map(item -> new ResidentDetailResponse.Candidate(item.id(), item.name())).toList()
		    : List.<ResidentDetailResponse.Candidate>of();
		return new ResidentDetailResponse(residentId, propertyId, resident.getName(), resident.getPhoneLast4(),
		    row.unitId(), row.buildingId(), building, row.unitNumber(), row.relationType(), row.representative(),
		    row.signupStatus(), resident.getCreatedAt(), resident.getUpdatedAt(),
		    !requests.findLinked(propertyId, residentId, resident.getUserId()).isEmpty(), candidates,
		    row.serviceRole());
	}

	/** 전체 번호는 사용자 버튼 요청에만 복호화하며 키 장애·변조 암호문을 원문 없는 고정 오류로 변환합니다. */
	@Transactional(readOnly = true)
	public String revealPhone(UUID actor, UUID propertyId, UUID residentId) {
		requireManagementAccess(actor, propertyId);
		var resident = requireResident(propertyId, residentId);
		if (resident.getPhoneEncrypted() == null)
			return null;
		try {
			return phones.getObject().decrypt(resident.getPhoneEncrypted());
		} catch (BeansException | IllegalArgumentException | IllegalStateException exception) {
			throw failure(PHONE_SECURITY_UNAVAILABLE);
		}
	}

	/** 등록과 같은 대상 잠금 아래 명부·연락처·확인된 신청·현재 세대·직접 선택한 대표를 원자적으로 수정합니다. */
	@Transactional
	public ResidentDetailResponse update(UUID actor, UUID propertyId, UUID residentId, ResidentUpdateRequest input) {
		requireManagementAccess(actor, propertyId);
		var property = properties.findForUnitUpdate(propertyId)
		    .orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		// 잠금 대기 중 관리소장 인계가 끝날 수 있으므로 현재 권한을 다시 확인합니다.
		requireManagementAccess(actor, propertyId);
		var resident = requireResident(propertyId, residentId);
		access.requireResidentWrite(actor, propertyId, resident.getUserId());
		requireUnchanged(resident, input.expectedUpdatedAt());
		// 역할 수정도 주민 정보와 같은 트랜잭션으로 묶습니다. 계정 미연결·권한 충돌이면 명부 수정도 롤백합니다.
		if (input.serviceRole() != null || input.expectedServiceRole() != null) {
			if (input.serviceRole() == null || input.expectedServiceRole() == null)
				throw new IllegalArgumentException("Incomplete role change");
			roleManagement.getObject().changeResidentRole(actor, propertyId, residentId,
			    new com.moahome.server.membership.dto.MemberRequests.Role(input.serviceRole(),
			        input.expectedServiceRole()));
		}
		var unit = registrations.requireUnit(property, input.unitId());
		var current = affiliations
		    .findByPropertyIdAndResidentIdAndStatusAndDeletedAtIsNull(propertyId, residentId, "ACTIVE").orElse(null);
		boolean moving = current == null || !current.getUnitId().equals(unit.getId());
		var successor = requireSuccessor(propertyId, residentId, moving ? current : null,
		    input.replacementResidentId());
		List<MembershipRequest> linked = requests.findLinked(propertyId, residentId, resident.getUserId());
		var name = TextValues.required(input.name(), 50);
		String encrypted = resident.getPhoneEncrypted(), hmac = resident.getPhoneHmac(),
		    last4 = resident.getPhoneLast4();
		switch (input.phoneAction()) {
			case "KEEP" -> {
				if (input.phone() != null)
					throw new IllegalArgumentException("Unexpected contact");
			}
			case "REMOVE" -> {
				if (!linked.isEmpty())
					throw failure(CONTACT_REQUIRED_FOR_REQUEST);
				encrypted = null;
				hmac = null;
				last4 = null;
			}
			case "REPLACE" -> {
				var protectedPhone = registrations.protectPhone(input.phone());
				if (protectedPhone == null)
					throw new IllegalArgumentException("Contact required");
				encrypted = protectedPhone.encrypted();
				hmac = protectedPhone.hmac();
				last4 = protectedPhone.last4();
			}
			default -> throw new IllegalArgumentException("Invalid contact action");
		}
		if (hmac != null) {
			List<Resident> duplicates = residents.findByPropertyIdAndNameAndPhoneHmac(propertyId, name, hmac).stream()
			    .filter(item -> !item.getId().equals(residentId)).toList();
			if (!duplicates.isEmpty())
				throw failure(duplicates.stream().anyMatch(item -> item.getDeletedAt() == null)
				    ? DUPLICATE_RESIDENT
				    : RESIDENT_RESTORE_REQUIRED);
		}
		// PostgreSQL timestamptz의 마이크로초 정밀도와 맞춰 응답의 수정 시각을 다음 요청에서도 비교할 수 있게 합니다.
		var at = OffsetDateTime.now(clock).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
		resident.update(name, encrypted, hmac, last4, at);
		if (input.phoneAction().equals("REPLACE")) {
			for (var request : linked)
				request.changePhone(encrypted, hmac, last4, at);
		}
		if (moving) {
			if (current != null)
				current.end(actor, at, false);
			designateSuccessor(actor, successor, at);
			// 현재 세대 유일 인덱스에 걸리지 않도록 이전 관계의 종료를 먼저 반영하고 새 관계를 추가합니다.
			affiliations.flush();
			boolean first = !affiliations.existsByPropertyIdAndUnitId(propertyId, unit.getId());
			affiliations.saveAndFlush(UnitResident.register(resident, unit, input.relationType(), first, at));
		} else
			current.changeRelation(input.relationType(), at);
		residents.flush();
		return detail(actor, propertyId, residentId);
	}

	/** 명부·현재 관계를 소프트 삭제하고 선택한 대표 승계·해당 대상의 주민 권한 종료·확인된 대기 취소를 함께 저장합니다. */
	@Transactional
	public void delete(UUID actor, UUID propertyId, UUID residentId, ResidentDeleteRequest input) {
		requireManagementAccess(actor, propertyId);
		properties.findForUnitUpdate(propertyId).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		requireManagementAccess(actor, propertyId);
		var resident = residents.findByIdAndPropertyId(residentId, propertyId)
		    .orElseThrow(() -> failure(RESIDENT_NOT_FOUND));
		access.requireResidentWrite(actor, propertyId, resident.getUserId());
		if (resident.getDeletedAt() != null)
			return;
		requireUnchanged(resident, input.expectedUpdatedAt());
		var current = affiliations
		    .findByPropertyIdAndResidentIdAndStatusAndDeletedAtIsNull(propertyId, residentId, "ACTIVE").orElse(null);
		var successor = requireSuccessor(propertyId, residentId, current, input.replacementResidentId());
		var at = OffsetDateTime.now(clock).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
		designateSuccessor(actor, successor, at);
		deleteResident(actor, propertyId, resident, current, at);
	}

	/** 동·세대 삭제에서는 현재 소속 주민 전체를 함께 삭제하므로 같은 세대 안의 대표 승계는 하지 않습니다. */
	@Transactional
	public void deleteForUnits(UUID actor, UUID propertyId, Collection<UUID> unitIds, OffsetDateTime at) {
		if (unitIds.isEmpty())
			return;
		// 세대 쓰기와 같은 잠금을 확보하고 삭제된 세대의 남은 현재 관계도 재요청에서 정리할 수 있게 합니다.
		access.getManagementContext(actor, propertyId);
		properties.findForUnitUpdate(propertyId).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		List<UnitResident> current = affiliations.findByPropertyIdAndUnitIdInAndStatusAndDeletedAtIsNull(propertyId,
		    unitIds, "ACTIVE");
		// 현재 관리자 권한을 재확인하고 각 명부의 관리소장 보호도 아래 삭제에서 검사합니다.
		if (!current.isEmpty())
			requireManagementAccess(actor, propertyId);
		for (var affiliation : current) {
			var resident = residents.findByIdAndPropertyId(affiliation.getResidentId(), propertyId)
			    .orElseThrow(() -> failure(RESIDENT_NOT_FOUND));
			deleteResident(actor, propertyId, resident, affiliation, at);
		}
		// 명부와 아직 연결되지 않은 대기도 삭제된 세대로 승인될 수 없도록 함께 취소합니다.
		requests.findByPropertyIdAndUnitIdInAndStatusAndDeletedAtIsNull(propertyId, unitIds, "PENDING")
		    .forEach(request -> request.cancelPending(at));
		affiliations.flush();
		residents.flush();
	}

	/** 개별·세대 일괄 삭제에서 명부·현재 관계·해당 관리대상 주민 권한·연결 대기를 같은 방식으로 종료합니다. */
	private void deleteResident(UUID actor, UUID propertyId, Resident resident, UnitResident current,
	    OffsetDateTime at) {
		// 일괄 세대 삭제도 관리소장 명부 수정 금지를 우회하지 못하게 같은 검사를 적용합니다.
		access.requireResidentWrite(actor, propertyId, resident.getUserId());
		if (current != null)
			current.end(actor, at, true);
		if (resident.getDeletedAt() == null)
			resident.delete(actor, at);
		if (resident.getUserId() != null) {
			members.findByPropertyIdAndUserIdAndDeletedAtIsNull(propertyId, resident.getUserId()).stream()
			    .filter(member -> member.getRole() == PropertyMemberRole.RESIDENT && member.getEndedAt() == null)
			    .forEach(member -> member.endResidentAccess(actor, at));
		}
		requests.findLinked(propertyId, resident.getId(), resident.getUserId())
		    .forEach(request -> request.cancelPending(at));
	}

	/** 남은 주민이 있는 대표의 이탈은 관리소장의 명시적 선택을 요구하고 다른 세대·삭제 주민·본인을 거부합니다. */
	private UnitResident requireSuccessor(UUID propertyId, UUID residentId, UnitResident current, UUID selected) {
		if (current == null || !current.isHouseholdRep()) {
			if (selected != null)
				throw failure(INVALID_REPRESENTATIVE);
			return null;
		}
		List<UnitResident> remaining = affiliations.findCurrentUnitResidents(propertyId, current.getUnitId()).stream()
		    .filter(item -> !item.getResidentId().equals(residentId)).toList();
		if (remaining.isEmpty() && selected == null)
			return null;
		if (selected == null)
			throw failure(REPRESENTATIVE_REQUIRED);
		return remaining.stream().filter(item -> item.getResidentId().equals(selected)).findFirst()
		    .orElseThrow(() -> failure(INVALID_REPRESENTATIVE));
	}

	private Resident requireResident(UUID propertyId, UUID residentId) {
		return residents.findByIdAndPropertyId(residentId, propertyId).filter(item -> item.getDeletedAt() == null)
		    .orElseThrow(() -> failure(RESIDENT_NOT_FOUND));
	}

	/** 대표 선택도 해당 주민의 수정 시각을 갱신해 이전 화면에서 새 대표 여부를 놓친 변경을 거부합니다. */
	private void designateSuccessor(UUID actor, UnitResident successor, OffsetDateTime at) {
		if (successor == null)
			return;
		access.requireResidentWrite(actor, successor.getPropertyId(),
		    requireResident(successor.getPropertyId(), successor.getResidentId()).getUserId());
		successor.designateRepresentative(at);
		requireResident(successor.getPropertyId(), successor.getResidentId()).touch(at);
	}

	/** 조회 시점 이후 변경된 입력으로 다른 관리 작업을 덮어쓰지 않습니다. */
	private void requireUnchanged(Resident resident, OffsetDateTime expected) {
		if (expected == null || !resident.getUpdatedAt().isEqual(expected))
			throw failure(RESIDENT_CHANGED);
	}

	private void requireManagementAccess(UUID actor, UUID propertyId) {
		access.getManagementContext(actor, propertyId);
	}

	private ResidentRegistrationException failure(ResidentRegistrationException.Code code) {
		return new ResidentRegistrationException(code);
	}
}
