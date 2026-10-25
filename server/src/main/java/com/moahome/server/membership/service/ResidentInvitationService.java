package com.moahome.server.membership.service;

import java.time.*;
import java.util.*;
import com.moahome.server.auth.exception.*;
import com.moahome.server.common.security.PhoneSecurity;
import com.moahome.server.common.validation.TextValues;
import com.moahome.server.membership.domain.*;
import com.moahome.server.membership.dto.ResidentInvitations;
import com.moahome.server.membership.repo.*;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.repo.*;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.resident.domain.*;
import com.moahome.server.resident.dto.ResidentUpdateRequest;
import com.moahome.server.resident.repo.*;
import com.moahome.server.resident.service.*;
import com.moahome.server.user.service.UserService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import static com.moahome.server.membership.repo.RedisInvitationCodeRepository.Kind.RESIDENT;

/** 개인 초대 발급과 수락·정정 승인은 명부 변경과 같은 Property 잠금 아래 원자적으로 처리합니다. */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ResidentInvitationService {
	private final ManagementAccessService access;

	private final PropertyRepository properties;

	private final ResidentRepository residents;

	private final UnitResidentRepository affiliations;

	private final UnitRepository units;

	private final BuildingRepository buildings;

	private final ResidentInvitationRepository invitations;

	private final RedisInvitationCodeRepository temporaryCodes;

	private final PropertyMemberRepository members;

	private final MemberRoleEventRepository events;

	private final MembershipRequestRepository requests;

	private final UserService users;

	private final ResidentRegistrationService registrations;

	private final ResidentManagementService management;

	private final ObjectProvider<PhoneSecurity> phones;

	private final ObjectProvider<com.moahome.server.common.security.InvitationCodeSecurity> codeSecurity;

	private final Clock clock;

	private final jakarta.persistence.EntityManager entityManager;

	private OffsetDateTime now() {
		return OffsetDateTime.now(clock).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
	}

	/** 발급·정정 반영은 명부 수정 권한이 있는 현재 관리자만 수행합니다. */
	private void lockManagementAccess(UUID actor, UUID property) {
		lock(property);
		access.getManagementContext(actor, property);
	}

	private Property lock(UUID property) {
		return properties.findForUnitUpdate(property)
		    .filter(p -> p.getDeletedAt() == null && p.getStatus() == PropertyStatus.ACTIVE)
		    .orElseThrow(() -> failure("INVALID_INVITATION"));
	}

	private Resident person(UUID property, UUID id) {
		return residents.findByIdAndPropertyId(id, property).filter(r -> r.getDeletedAt() == null)
		    .orElseThrow(() -> failure("INVALID_INVITATION"));
	}

	private UnitResident relation(UUID property, UUID resident) {
		var relation = affiliations
		    .findByPropertyIdAndResidentIdAndStatusAndDeletedAtIsNull(property, resident, "ACTIVE")
		    .orElseThrow(() -> failure("MEMBER_RESIDENT_REQUIRED"));
		units.findById(relation.getUnitId()).filter(u -> u.getPropertyId().equals(property) && u.getDeletedAt() == null)
		    .orElseThrow(() -> failure("INVALID_INVITATION"));
		return relation;
	}

	private String label(ResidentInvitation invitation) {
		return units.findById(invitation.getUnitId()).map(u -> {
			String building = u.getBuildingId() == null
			    ? ""
			    : buildings.findById(u.getBuildingId()).map(Building::getName).orElse("");
			return (building + " " + u.getUnitNumber() + "호").strip();
		}).orElse("삭제된 세대");
	}

	private String status(ResidentInvitation invitation) {
		return "ISSUED".equals(invitation.getStatus()) && !now().isBefore(invitation.getExpiresAt())
		    ? "EXPIRED"
		    : invitation.getStatus();
	}

	/** 관리자는 마스킹된 연락처와 초대 상태만 조회하며 토큰 원문은 발급 응답에서만 전달합니다. */
	public ResidentInvitations.Workspace workspace(UUID actor, UUID property) {
		access.getManagementContext(actor, property);
		List<ResidentInvitations.Item> rows = invitations.findByPropertyIdOrderByCreatedAtDesc(property).stream()
		    .map(i -> {
			    var resident = residents.findByIdAndPropertyId(i.getResidentId(), property)
			        .orElseThrow(() -> failure("INVALID_INVITATION"));
			    return new ResidentInvitations.Item(i.getId(), resident.getId(), resident.getName(), label(i),
			        resident.getPhoneLast4(), status(i), i.getRevision(), i.getExpiresAt(), i.getRequestedName(),
			        i.getPhoneLast4(), i.getPhoneAction());
		    }).toList();
		return new ResidentInvitations.Workspace(property, rows);
	}

	/** 재발급은 이전 미사용 링크를 철회하고 새 30분 코드를 만들며 검토 중 정정 요청은 보존합니다. */
	@Transactional
	public ResidentInvitations.Issued issue(UUID actor, UUID property, UUID residentId) {
		lockManagementAccess(actor, property);
		var resident = person(property, residentId);
		if (resident.getUserId() != null)
			throw failure("MEMBER_ROLE_CONFLICT");
		var relation = relation(property, residentId);
		List<ResidentInvitation> current = invitations.findByPropertyIdAndResidentIdAndStatusIn(property, residentId,
		    List.of("ISSUED", "CHANGE_REQUESTED"));
		if (current.stream().anyMatch(i -> "CHANGE_REQUESTED".equals(i.getStatus())))
			throw failure("MEMBER_ROLE_CONFLICT");
		var at = now();
		current.forEach(i -> {
			i.finish("REVOKED", actor, at);
			temporaryCodes.deleteAfterCommit(RESIDENT, i.getId());
		});
		invitations.flush();
		String token = ResidentInviteCode.create("R");
		var invitation = ResidentInvitation.issue(property, residentId, relation.getUnitId(), relation.getId(),
		    resident.getUpdatedAt(), ResidentInviteCode.hash(token), actor, at);
		invitations.saveAndFlush(invitation);
		temporaryCodes.create(RESIDENT, invitation.getId(), property, invitation.getTokenHash(),
		    invitation.getExpiresAt(), codeSecurity.getObject().encrypt(property, invitation.getId(), token));
		return new ResidentInvitations.Issued(invitation.getId(), token, invitation.getExpiresAt());
	}

	/** 관리소장이 같은 유효 초대를 다시 전달하며 재발급·만료 연장·revision 변경을 수행하지 않습니다. */
	@Transactional
	public ResidentInvitations.Issued share(UUID actor, UUID property, UUID id) {
		lockManagementAccess(actor, property);
		var invitation = required(property, id);
		if (!"ISSUED".equals(status(invitation)))
			throw failure("INVALID_INVITATION");
		unchanged(invitation);
		String encrypted = requireCode(invitation);
		if (encrypted.isBlank())
			throw failure("INVALID_INVITATION");
		String token = codeSecurity.getObject().decrypt(property, id, encrypted);
		if (!ResidentInviteCode.hash(token).equals(invitation.getTokenHash()))
			throw failure("INVALID_INVITATION");
		return new ResidentInvitations.Issued(id, token, invitation.getExpiresAt());
	}

	/** 기존 클라이언트의 복원 요청도 현재 Redis 코드와 대조하며 유실된 검증값을 DB 해시로 복구하지 않습니다. */
	@Transactional
	public ResidentInvitations.Issued restore(UUID actor, UUID property, UUID id, String original) {
		lockManagementAccess(actor, property);
		var invitation = required(property, id);
		if (!"ISSUED".equals(status(invitation)))
			throw failure("INVALID_INVITATION");
		unchanged(invitation);
		if (!ResidentInviteCode.hash(original).equals(invitation.getTokenHash()))
			throw failure("INVALID_INVITATION");
		return share(actor, property, id);
	}

	/** DB 해시는 이력·동일 수락 재시도 식별용이며 미사용 초대의 권한 증명에는 Redis 존재가 필수입니다. */
	private String requireCode(ResidentInvitation invitation) {
		return temporaryCodes.require(RESIDENT, invitation.getId(), invitation.getPropertyId(),
		    invitation.getTokenHash(), invitation.getExpiresAt());
	}

	private ResidentInvitation required(UUID property, UUID id) {
		return invitations.findById(id).filter(i -> i.getPropertyId().equals(property))
		    .orElseThrow(() -> failure("INVALID_INVITATION"));
	}

	/** 토큰은 요청 본문으로만 받아 해시로 찾으며 HTTP 주소·접근 로그에 원문을 남기지 않습니다. */
	private ResidentInvitation token(String value) {
		return invitations.findByTokenHash(ResidentInviteCode.hash(value))
		    .orElseThrow(() -> failure("INVALID_INVITATION"));
	}

	/** 링크 발급 뒤 명부 수정·세대 이동·삭제가 있었다면 과거 정보로 계정을 연결하지 않습니다. */
	private Resident unchanged(ResidentInvitation invitation) {
		var resident = person(invitation.getPropertyId(), invitation.getResidentId());
		var relation = relation(invitation.getPropertyId(), resident.getId());
		if (resident.getUserId() != null || !relation.getId().equals(invitation.getUnitResidentId())
		    || !relation.getUnitId().equals(invitation.getUnitId())
		    || !resident.getUpdatedAt().toInstant().equals(invitation.getResidentUpdatedAt().toInstant()))
			throw failure("INVALID_INVITATION");
		return resident;
	}

	/** 사용 전에는 만료·현재 명부를 확인하고 사용 뒤에는 수락한 본인만 처리 결과를 다시 볼 수 있습니다. */
	public ResidentInvitations.Preview preview(UUID actor, String value) {
		users.requireActive(actor);
		var invitation = token(value);
		var property = properties.findById(invitation.getPropertyId())
		    .filter(p -> p.getDeletedAt() == null && p.getStatus() == PropertyStatus.ACTIVE)
		    .orElseThrow(() -> failure("INVALID_INVITATION"));
		if ("ISSUED".equals(status(invitation))) {
			unchanged(invitation);
			requireCode(invitation);
		} else if (!actor.equals(invitation.getRequestedBy())
		    || !Set.of("CHANGE_REQUESTED", "APPROVED").contains(invitation.getStatus()))
			throw failure("INVALID_INVITATION");
		var resident = person(invitation.getPropertyId(), invitation.getResidentId());
		return new ResidentInvitations.Preview(property.getId(), property.getName(), resident.getName(), label(invitation),
		    resident.getPhoneLast4(), invitation.getStatus(), invitation.getExpiresAt(), invitation.getRevision());
	}

	/** 동일 관리대상의 다른 주민 연결이나 관리자 역할을 덮어쓰지 않습니다. 기존 일반 신청도 임의 종료하지 않습니다. */
	private void canConnect(ResidentInvitation invitation, UUID actor) {
		users.requireActive(actor);
		UUID property = invitation.getPropertyId();
		if (residents.findByPropertyIdAndUserIdAndDeletedAtIsNull(property, actor).stream()
		    .anyMatch(r -> !r.getId().equals(invitation.getResidentId())))
			throw failure("MEMBER_ROLE_CONFLICT");
		List<PropertyMember> current = members.findByPropertyIdAndUserIdAndDeletedAtIsNull(property, actor).stream()
		    .filter(PropertyMember::isCurrent).toList();
		if (current.size() > 1 || current.stream().anyMatch(m -> m.getRole() != PropertyMemberRole.RESIDENT))
			throw failure("MEMBER_ROLE_CONFLICT");
		if (requests.findByPropertyIdOrderByRequestedAtDesc(property).stream()
		    .anyMatch(r -> r.getDeletedAt() == null && r.getUserId().equals(actor) && "PENDING".equals(r.getStatus())))
			throw failure("MEMBER_ROLE_CONFLICT");
	}

	/** 일회용 수락과 계정·주민 권한·승인 출처를 같은 트랜잭션에 반영하며 실패 시 모두 롤백합니다. */
	private void connect(ResidentInvitation invitation, Resident resident, UUID reviewer) {
		UUID actor = invitation.getRequestedBy();
		canConnect(invitation, actor);
		var at = now();
		resident.connectApprovedUser(actor, at);
		boolean exists = members.findByPropertyIdAndUserIdAndDeletedAtIsNull(invitation.getPropertyId(), actor).stream()
		    .anyMatch(PropertyMember::isCurrent);
		if (!exists) {
			var member = members.saveAndFlush(PropertyMember.invited(invitation.getPropertyId(),
			    users.requireActive(actor), PropertyMemberRole.RESIDENT, at));
			events.save(MemberRoleEvent.record(member, null, reviewer, at));
		}
		invitation.approve(reviewer, at);
		residents.flush();
		invitations.flush();
		events.flush();
	}

	/** 정보 일치는 즉시 가입하고 정정 입력은 명부·권한과 분리한 승인 대기로 보존합니다. */
	@Transactional
	public ResidentInvitations.Result accept(UUID actor, ResidentInvitations.Claim input) {
		users.requireActive(actor);
		var found = token(input.token());
		lock(found.getPropertyId());
		// 잠금 대기 중 다른 요청이 토큰을 사용했을 수 있어 최신 버전을 다시 읽습니다.
		entityManager.refresh(found);
		var invitation = token(input.token());
		if (actor.equals(invitation.getRequestedBy())
		    && Set.of("APPROVED", "CHANGE_REQUESTED").contains(invitation.getStatus())) {
			// 커밋 후 Redis 삭제 응답이 유실됐어도 같은 계정의 재시도에서 다시 정리하고 기존 결과를 반환합니다.
			temporaryCodes.deleteAfterCommit(RESIDENT, invitation.getId());
			return new ResidentInvitations.Result(invitation.getStatus());
		}
		if (!"ISSUED".equals(status(invitation)))
			throw failure("INVALID_INVITATION");
		requireCode(invitation);
		var resident = unchanged(invitation);
		canConnect(invitation, actor);
		invitation.claim(actor, now());
		temporaryCodes.deleteAfterCommit(RESIDENT, invitation.getId());
		if (!input.correction()) {
			if (input.name() != null || input.phoneAction() != null || input.phone() != null)
				throw new IllegalArgumentException("Unexpected corrections");
			connect(invitation, resident, actor);
			return new ResidentInvitations.Result("APPROVED");
		}
		String name = TextValues.required(input.name(), 50);
		String action = input.phoneAction();
		if (action == null || !Set.of("KEEP", "SET", "REMOVE").contains(action))
			throw new IllegalArgumentException("Invalid contact action");
		if (!"SET".equals(action) && input.phone() != null)
			throw new IllegalArgumentException("Unexpected contact");
		var phone = "SET".equals(action) ? registrations.protectPhone(input.phone()) : null;
		if ("SET".equals(action) && phone == null)
			throw new IllegalArgumentException("Contact required");
		invitation.requestChange(name, action, phone == null ? null : phone.encrypted(),
		    phone == null ? null : phone.hmac(), phone == null ? null : phone.last4());
		invitations.flush();
		return new ResidentInvitations.Result("CHANGE_REQUESTED");
	}

	/** 철회는 이전 링크만 닫으며 이미 부여된 주민 권한은 제거하지 않습니다. */
	@Transactional
	public ResidentInvitations.Workspace revoke(UUID actor, UUID property, UUID id, ResidentInvitations.Review input) {
		lockManagementAccess(actor, property);
		var invitation = required(property, id);
		requireRevision(invitation, input);
		if (!Set.of("ISSUED", "CHANGE_REQUESTED").contains(invitation.getStatus()))
			throw failure("INVALID_INVITATION");
		invitation.finish("REVOKED", actor, now());
		temporaryCodes.deleteAfterCommit(RESIDENT, invitation.getId());
		invitations.flush();
		return workspace(actor, property);
	}

	private void requireRevision(ResidentInvitation invitation, ResidentInvitations.Review input) {
		if (input.revision() == null || invitation.getRevision() != input.revision())
			throw failure("MEMBER_ROLE_CONFLICT");
	}

	/** 정정은 기존 명부 수정 서비스를 재사용하여 중복 주민·연락처 정책을 지키고 가입까지 원자적으로 완료합니다. */
	@Transactional
	public ResidentInvitations.Workspace review(UUID actor, UUID property, UUID id, ResidentInvitations.Review input,
	    boolean approve) {
		lockManagementAccess(actor, property);
		var invitation = required(property, id);
		requireRevision(invitation, input);
		if (!"CHANGE_REQUESTED".equals(invitation.getStatus()))
			throw failure("INVALID_INVITATION");
		if (!approve) {
			invitation.finish("REJECTED", actor, now());
			invitations.flush();
			return workspace(actor, property);
		}
		var resident = unchanged(invitation);
		var relation = relation(property, resident.getId());
		canConnect(invitation, invitation.getRequestedBy());
		String action = "SET".equals(invitation.getPhoneAction()) ? "REPLACE" : invitation.getPhoneAction();
		String phone = "SET".equals(invitation.getPhoneAction())
		    ? phones.getObject().decrypt(invitation.getPhoneEncrypted())
		    : null;
		management.update(actor, property, resident.getId(), new ResidentUpdateRequest(invitation.getRequestedName(),
		    relation.getUnitId(), relation.getRelationType(), action, phone, null, resident.getUpdatedAt()));
		connect(invitation, resident, actor);
		return workspace(actor, property);
	}

	private PaymentException failure(String code) {
		return new PaymentException(code);
	}
}
