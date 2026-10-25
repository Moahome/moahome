package com.moahome.server.membership.service;

import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.moahome.server.auth.exception.*;
import com.moahome.server.common.validation.TextValues;
import com.moahome.server.membership.domain.*;
import com.moahome.server.membership.dto.SignupRequests;
import com.moahome.server.membership.repo.*;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.repo.*;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.resident.repo.*;
import com.moahome.server.resident.service.ResidentRegistrationService;
import com.moahome.server.user.repo.UserRepository;
import com.moahome.server.user.service.UserService;

@Service
@Transactional(readOnly = true)
public class MembershipRequestService {
	private final ManagementAccessService access;

	private final PropertyRepository properties;

	private final UnitRepository units;

	private final BuildingRepository buildings;

	private final MembershipRequestRepository requests;

	private final PropertyMemberRepository members;

	private final MemberRoleEventRepository events;

	private final ResidentRepository residents;

	private final UnitResidentRepository affiliations;

	private final UserService users;

	private final UserRepository userRecords;

	private final ResidentRegistrationService registrations;

	private final Clock clock;

	private final ResidentJoinCodeService joinCodes;

	public MembershipRequestService(ManagementAccessService access, PropertyRepository properties, UnitRepository units,
	    BuildingRepository buildings, MembershipRequestRepository requests, PropertyMemberRepository members,
	    MemberRoleEventRepository events, ResidentRepository residents, UnitResidentRepository affiliations,
	    UserService users, UserRepository userRecords,
	    ResidentRegistrationService registrations, Clock clock,
	    ResidentJoinCodeService joinCodes) {
		this.access = access;
		this.properties = properties;
		this.units = units;
		this.buildings = buildings;
		this.requests = requests;
		this.members = members;
		this.events = events;
		this.residents = residents;
		this.affiliations = affiliations;
		this.users = users;
		this.userRecords = userRecords;
		this.registrations = registrations;
		this.clock = clock;
		this.joinCodes = joinCodes;
	}

	private OffsetDateTime now() {
		return OffsetDateTime.now(clock).truncatedTo(ChronoUnit.MICROS);
	}

	private Property target(UUID property) {
		return properties.findById(property)
		    .filter(p -> p.getDeletedAt() == null && p.getStatus() == PropertyStatus.ACTIVE)
		    .orElseThrow(() -> new PaymentException("MEMBER_NOT_FOUND"));
	}

	private void lockManager(UUID actor, UUID property) {
		properties.findForUnitUpdate(property).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		access.getManagementContext(actor, property);
	}

	private Map<UUID, String> unitLabels(UUID property) {
		Map<UUID, String> names = buildings.findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(property)
		    .stream().collect(Collectors.toMap(building -> building.getId(), building -> building.getName()));
		return units.findByPropertyIdAndDeletedAtIsNull(property).stream().collect(Collectors.toMap(entry -> entry.getId(),
		    u -> names.getOrDefault(u.getBuildingId(), "") + " " + u.getUnitNumber() + "호"));
	}

	/** 공유한 참여 주소로 로그인한 신청자에게 세대 표시만 제공하고 주민·연락처는 공개하지 않습니다. */
	public SignupRequests.Options options(UUID actor, UUID property, String code) {
		users.requireActive(actor);
		joinCodes.require(property, code);
		var target = target(property);
		return new SignupRequests.Options(property, target.getName(),
		    unitLabels(property).entrySet().stream().map(e -> new SignupRequests.UnitOption(e.getKey(), e.getValue()))
		        .sorted(Comparator.comparing(unitOption -> unitOption.label())).toList());
	}

	/** 세대·연락처를 검증해 대기 신청을 한 번 저장하며 계정·권한·명부는 승인 전 변경하지 않습니다. */
	@Transactional
	public SignupRequests.Result request(UUID actor, UUID property, SignupRequests.Create input) {
		users.requireActive(actor);
		properties.findForUnitUpdate(property).orElseThrow(() -> new PaymentException("MEMBER_NOT_FOUND"));
		target(property);
		var code = joinCodes.require(property, input.code());
		String name = TextValues.required(input.name(), 50);
		if (!unitLabels(property).containsKey(input.unitId()))
			throw new IllegalArgumentException("Invalid unit");
		List<MembershipRequest> existing = requests
		    .findByPropertyIdAndUserIdAndUnitIdAndStatusAndDeletedAtIsNull(property, actor, input.unitId(), "PENDING");
		if (!existing.isEmpty())
			return new SignupRequests.Result(existing.getFirst().getId(), "PENDING");
		if (members.findByPropertyIdAndUserIdAndDeletedAtIsNull(property, actor).stream()
		    .anyMatch(propertyMember -> propertyMember.isCurrent()))
			throw new PaymentException("MEMBER_ROLE_CONFLICT");
		var protectedPhone = registrations.protectPhone(input.phone());
		var created = MembershipRequest.request(property, input.unitId(), actor,
		    protectedPhone == null ? null : protectedPhone.encrypted(),
		    protectedPhone == null ? null : protectedPhone.hmac(),
		    protectedPhone == null ? null : protectedPhone.last4(), now());
		created.describeApplicant(name, code.getId());
		requests.saveAndFlush(created);
		return new SignupRequests.Result(created.getId(), "PENDING");
	}

	/** 가입 업무용 미연결 주민만 조회하며 관리자 소속 확인 후 끝 네 자리·현재 소속만 반환합니다. */
	public SignupRequests.UnlinkedResidents unlinkedResidents(UUID actor, UUID property) {
		access.getManagementContext(actor, property);
		List<SignupRequests.UnlinkedResident> rows = residents.findUnlinkedResidents(property).stream()
		    .map(row -> new SignupRequests.UnlinkedResident(row.getResidentId(), row.getName(), row.getPhoneLast4(),
		        row.getBuildingName(), row.getUnitNumber(), row.getRelationType()))
		    .toList();
		return new SignupRequests.UnlinkedResidents(property, rows);
	}

	/** 승인 관리에 실제 신청자·해당 세대 명부 후보만 제공하며 신청이 없는 주민을 대기로 만들지 않습니다. */
	public SignupRequests.Workspace workspace(UUID actor, UUID property) {
		access.getManagementContext(actor, property);
		Map<UUID, String> labels = unitLabels(property);
		// 신청자가 정지·탈퇴해도 관리자 목록과 거절을 막지 않습니다. 실제 승인에서는 정상 계정을 별도로 확인합니다.
		List<SignupRequests.Item> rows = requests.findByPropertyIdOrderByRequestedAtDesc(property).stream()
		    .filter(r -> r.getDeletedAt() == null).map(r -> {
			    List<SignupRequests.Candidate> candidates = affiliations
			        .findCurrentUnitResidents(property, r.getUnitId()).stream()
			        .map(a -> residents.findByIdAndPropertyId(a.getResidentId(), property).orElseThrow())
			        .filter(person -> person.getUserId() == null || person.getUserId().equals(r.getUserId()))
			        .map(person -> new SignupRequests.Candidate(person.getId(), person.getName())).toList();
			    return new SignupRequests.Item(r.getId(), r.getUnitId(), labels.getOrDefault(r.getUnitId(), "삭제된 세대"),
			        userRecords.findByIdAndDeletedAtIsNull(r.getUserId())
			            .map(entry -> entry.getDisplayName()).orElse("탈퇴한 사용자"),
			        r.getPhoneLast4(), r.getStatus(), r.getRequestedAt(), r.getUpdatedAt(), candidates,
			        r.getApplicantName());
		    }).toList();
		return new SignupRequests.Workspace(property, rows);
	}

	private MembershipRequest required(UUID property, UUID id) {
		return requests.findById(id).filter(r -> property.equals(r.getPropertyId()) && r.getDeletedAt() == null)
		    .orElseThrow(() -> new PaymentException("MEMBER_NOT_FOUND"));
	}

	/** 관리소장·부담당자가 선택한 현재 세대 주민에게 계정·RESIDENT 참여·신청 승인을 함께 연결합니다. */
	@Transactional
	public SignupRequests.Workspace approve(UUID actor, UUID property, UUID id, SignupRequests.Approve input) {
		lockManager(actor, property);
		var request = required(property, id);
		if ("APPROVED".equals(request.getStatus()) && input.residentId().equals(request.getMatchedResidentId()))
			return workspace(actor, property);
		if (!"PENDING".equals(request.getStatus())
		    || !request.getUpdatedAt().toInstant().equals(input.expectedUpdatedAt().toInstant()))
			throw new PaymentException("MEMBER_ROLE_CONFLICT");
		var person = residents.findByIdAndPropertyId(input.residentId(), property).filter(r -> r.getDeletedAt() == null)
		    .orElseThrow(() -> new PaymentException("MEMBER_NOT_FOUND"));
		var affiliation = affiliations
		    .findByPropertyIdAndResidentIdAndStatusAndDeletedAtIsNull(property, person.getId(), "ACTIVE")
		    .orElseThrow(() -> new PaymentException("MEMBER_RESIDENT_REQUIRED"));
		if (!affiliation.getUnitId().equals(request.getUnitId())
		    || !unitLabels(property).containsKey(request.getUnitId())
		    || (person.getUserId() != null && !person.getUserId().equals(request.getUserId()))
		    || residents.findByPropertyIdAndUserIdAndDeletedAtIsNull(property, request.getUserId()).stream()
		        .anyMatch(r -> !r.getId().equals(person.getId())))
			throw new PaymentException("MEMBER_ROLE_CONFLICT");
		var user = users.requireActive(request.getUserId());
		List<PropertyMember> current = members.findByPropertyIdAndUserIdAndDeletedAtIsNull(property, user.getId())
		    .stream().filter(propertyMember -> propertyMember.isCurrent()).toList();
		if (current.size() > 1 || (!current.isEmpty() && current.getFirst().getRole() != PropertyMemberRole.RESIDENT))
			throw new PaymentException("MEMBER_ROLE_CONFLICT");
		var at = now();
		person.connectApprovedUser(user.getId(), at);
		if (current.isEmpty()) {
			var member = members.saveAndFlush(PropertyMember.invited(property, user, PropertyMemberRole.RESIDENT, at));
			events.save(MemberRoleEvent.record(member, null, actor, at));
		}
		request.approve(person.getId(), actor, at);
		residents.flush();
		requests.flush();
		events.flush();
		return workspace(actor, property);
	}

	/** 거절은 신청 이력을 유지하며 주민·계정·역할을 만들지 않습니다. */
	@Transactional
	public SignupRequests.Workspace reject(UUID actor, UUID property, UUID id, SignupRequests.Reject input) {
		lockManager(actor, property);
		var request = required(property, id);
		if ("REJECTED".equals(request.getStatus()))
			return workspace(actor, property);
		if (!"PENDING".equals(request.getStatus())
		    || !request.getUpdatedAt().toInstant().equals(input.expectedUpdatedAt().toInstant()))
			throw new PaymentException("MEMBER_ROLE_CONFLICT");
		request.reject(actor, now());
		requests.flush();
		return workspace(actor, property);
	}
}
