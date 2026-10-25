package com.moahome.server.membership.service;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.moahome.server.auth.exception.*;
import com.moahome.server.membership.domain.*;
import com.moahome.server.membership.dto.*;
import com.moahome.server.membership.repo.*;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.property.domain.PropertyStatus;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.property.repo.UnitRepository;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.resident.domain.Resident;
import com.moahome.server.resident.domain.ResidentAccountLink;
import com.moahome.server.resident.repo.*;
import com.moahome.server.user.repo.UserRepository;
import com.moahome.server.user.service.UserService;

import static com.moahome.server.membership.repo.RedisInvitationCodeRepository.Kind.MANAGER;

@Service
@Transactional(readOnly = true)
public class MemberManagementService {
	private final ManagementAccessService access;

	private final PropertyRepository properties;

	private final PropertyMemberRepository members;

	private final MemberRoleEventRepository events;

	private final MemberInvitationRepository invitations;

	private final RedisInvitationCodeRepository temporaryCodes;

	private final ResidentRepository residents;

	private final UnitResidentRepository affiliations;

	private final ResidentAccountLinkRepository accountLinks;

	private final UnitRepository units;

	private final UserRepository users;

	private final UserService accounts;

	private final Clock clock;

	public MemberManagementService(ManagementAccessService access, PropertyRepository properties,
	    PropertyMemberRepository members, MemberRoleEventRepository events, MemberInvitationRepository invitations,
	    ResidentRepository residents, UnitResidentRepository affiliations, ResidentAccountLinkRepository accountLinks,
	    UnitRepository units, UserRepository users, UserService accounts,
	    Clock clock, RedisInvitationCodeRepository temporaryCodes) {
		this.access = access;
		this.properties = properties;
		this.members = members;
		this.events = events;
		this.invitations = invitations;
		this.residents = residents;
		this.affiliations = affiliations;
		this.accountLinks = accountLinks;
		this.units = units;
		this.users = users;
		this.accounts = accounts;
		this.clock = clock;
		this.temporaryCodes = temporaryCodes;
	}

	private OffsetDateTime now() {
		return OffsetDateTime.now(clock);
	}

	/** 본인 참여 종료와 선택한 실제 퇴거를 같은 잠금·트랜잭션으로 처리해 권한과 거주 상태의 부분 저장을 막습니다. */
	@Transactional
	public void leave(UUID actor, UUID property, MemberRequests.Leave input) {
		properties.findForUnitUpdate(property).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		// 주민도 사용할 수 있으므로 관리자 전용 검증 대신 현재 본인 참여와 정상 계정을 확인합니다.
		access.getPropertyAccessContext(actor, property);
		List<PropertyMember> current = members.findByPropertyIdAndUserIdAndDeletedAtIsNull(property, actor).stream()
		    .filter(PropertyMember::isCurrent).toList();
		if (current.size() != 1)
			throw failure("MEMBER_ROLE_CONFLICT");
		PropertyMember member = current.getFirst();
		if (member.getRole() == PropertyMemberRole.ADMIN)
			throw failure("MEMBER_TRANSFER_REQUIRED");
		OffsetDateTime at = now().atZoneSameInstant(ZoneId.of("Asia/Seoul")).toOffsetDateTime();
		if (input.reason() == MemberRequests.LeaveReason.MOVE_OUT)
			moveOut(actor, property, at);
		member.leave(at);
		events.save(MemberRoleEvent.record(member, member.getRole(), actor, at));
		// 뒤 단계의 기록 저장 실패도 퇴거·참여 종료와 함께 롤백합니다. 다른 참여·명부·장부는 변경하지 않습니다.
		affiliations.flush();
		members.flush();
		events.flush();
	}

	/** 본인의 현재 관계만 퇴거로 남기며 대표 자동 승계와 명부 삭제·계정 연결 해제를 수행하지 않습니다. */
	private void moveOut(UUID actor, UUID property, OffsetDateTime at) {
		List<Resident> linked = residents.findByPropertyIdAndUserIdAndDeletedAtIsNull(property, actor);
		if (linked.size() != 1)
			throw failure("MEMBER_RESIDENT_REQUIRED");
		var current = affiliations.findByPropertyIdAndResidentIdAndStatusAndDeletedAtIsNull(property,
		    linked.getFirst().getId(), "ACTIVE").orElseThrow(() -> failure("MEMBER_RESIDENT_REQUIRED"));
		// 후임 대표는 기존 정책대로 관리소장이 지정해야 하므로 본인 나가기로 자동 지정하지 않습니다.
		if (current.isHouseholdRep() && affiliations.findCurrentUnitResidents(property, current.getUnitId()).stream()
		    .anyMatch(item -> !item.getResidentId().equals(current.getResidentId())))
			throw failure("MEMBER_REPRESENTATIVE_REQUIRED");
		current.end(actor, at, false);
		linked.getFirst().touch(at);
	}

	private void requireAdmin(UUID actor, UUID property) {
		if (access.getManagementContext(actor, property).role() != PropertyMemberRole.ADMIN)
			throw new AuthException(AuthErrorCode.ACCESS_DENIED);
	}

	/** 역할 변경과 업무 저장은 같은 대상 잠금을 사용하고 잠금 뒤 현재 관리자 권한을 다시 검사합니다. */
	private void lock(UUID actor, UUID property) {
		properties.findForUnitUpdate(property).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		access.getManagementContext(actor, property);
	}

	public MemberResponse.Workspace workspace(UUID actor, UUID property) {
		access.getManagementContext(actor, property);
		List<MemberResponse.Member> memberRows = members.findByPropertyIdAndDeletedAtIsNull(property).stream()
		    .filter(PropertyMember::isCurrent).map(m -> {
			    List<Resident> linked = residents.findByPropertyIdAndUserIdAndDeletedAtIsNull(property, m.getUserId());
			    var resident = linked.size() == 1 ? linked.getFirst() : null;
			    return new MemberResponse.Member(m.getId(),
			        resident == null
			            ? users.findById(m.getUserId()).orElseThrow().getDisplayName()
			            : resident.getName(),
			        resident == null ? null : resident.getId(), m.getRole());
		    }).toList();
		List<MemberResponse.Invitation> invitationRows = invitations.findByPropertyIdOrderByCreatedAtDesc(property)
		    .stream().filter(i -> i.getRole() == PropertyMemberRole.MANAGER).map(i -> {
			    String status = "ISSUED".equals(i.getStatus())
			        && !now().isBefore(i.getExpiresAt()) ? "EXPIRED" : i.getStatus();
			    return new MemberResponse.Invitation(i.getId(), i.getRevision(), status, i.getRole(), null, null,
			        i.getRequestedBy() == null
			            ? null
			            : users.findById(i.getRequestedBy()).orElseThrow().getDisplayName(),
			        i.getExpiresAt());
		    }).toList();
		return new MemberResponse.Workspace(property, memberRows, invitationRows);
	}

	private PropertyMember requiredMember(UUID property, UUID id) {
		return members.findById(id).filter(m -> property.equals(m.getPropertyId()) && m.isCurrent())
		    .orElseThrow(() -> failure("MEMBER_NOT_FOUND"));
	}

	private PropertyMember uniqueMember(UUID property, UUID user) {
		List<PropertyMember> current = members.findByPropertyIdAndUserIdAndDeletedAtIsNull(property, user).stream()
		    .filter(PropertyMember::isCurrent).toList();
		if (current.size() != 1)
			throw failure("MEMBER_ROLE_CONFLICT");
		return current.getFirst();
	}

	private void change(PropertyMember member, PropertyMemberRole role, UUID actor) {
		var before = member.getRole();
		if (before == role)
			return;
		member.changeRole(role, now());
		events.save(MemberRoleEvent.record(member, before, actor, now()));
	}

	/** 현재 관리자 본인의 계정만 명부에 연결하며 권한·대표·연락처는 변경하지 않습니다. */
	@Transactional
	public void linkOwnResident(UUID actor, UUID property, UUID residentId, UUID expectedUnitId) {
		// 가입 승인·명부 수정·인계와 같은 대상 잠금을 사용해 연결 충돌과 인계 이후의 요청을 직렬화합니다.
		lock(actor, property);
		var member = uniqueMember(property, actor);
		if (member.getRole() != PropertyMemberRole.ADMIN && member.getRole() != PropertyMemberRole.MANAGER)
			throw failure("MEMBER_ROLE_CONFLICT");
		accounts.requireActive(actor);
		var resident = requiredResident(property, residentId);
		var affiliation = affiliations
		    .findByPropertyIdAndResidentIdAndStatusAndDeletedAtIsNull(property, residentId, "ACTIVE")
		    .orElseThrow(() -> failure("MEMBER_RESIDENT_REQUIRED"));
		if (!affiliation.getUnitId().equals(expectedUnitId))
			throw failure("MEMBER_ROLE_CONFLICT");
		units.findByIdAndPropertyIdAndDeletedAtIsNull(affiliation.getUnitId(), property)
		    .orElseThrow(() -> failure("MEMBER_RESIDENT_REQUIRED"));
		if ((resident.getUserId() != null && !actor.equals(resident.getUserId()))
		    || residents.findByPropertyIdAndUserIdAndDeletedAtIsNull(property, actor).stream()
		        .anyMatch(person -> !residentId.equals(person.getId()))) {
			throw failure("MEMBER_ROLE_CONFLICT");
		}
		// 응답 유실·중복 클릭의 같은 연결은 원래 이력으로 성공 처리하며 새 참여나 가짜 가입 신청을 만들지 않습니다.
		boolean recorded = accountLinks.existsByPropertyIdAndResidentIdAndUserIdAndUnitResidentId(property, residentId,
		    actor, affiliation.getId());
		if (recorded && actor.equals(resident.getUserId()))
			return;
		resident.connectApprovedUser(actor, now());
		residents.flush();
		if (!recorded)
			accountLinks.saveAndFlush(
			    ResidentAccountLink.record(resident, affiliation, actor, now()));
	}

	/** 주민 상세의 역할 변경은 승인된 계정 연결에만 적용하고 관리소장 변경은 전용 인계로 제한합니다. */
	@Transactional
	public void changeResidentRole(UUID actor, UUID property, UUID residentId, MemberRequests.Role input) {
		lock(actor, property);
		var resident = requiredResident(property, residentId);
		if (resident.getUserId() == null)
			throw failure("MEMBER_ACCOUNT_REQUIRED");
		boolean approved = residents.findDirectory(property).stream()
		    .anyMatch(r -> residentId.equals(r.getId()) && r.getApproved());
		if (!approved)
			throw failure("MEMBER_ACCOUNT_REQUIRED");
		changeRole(actor, property, uniqueMember(property, resident.getUserId()), input);
	}

	@Transactional
	public MemberResponse.Workspace changeMemberRole(UUID actor, UUID property, UUID memberId,
	    MemberRequests.Role input) {
		lock(actor, property);
		changeRole(actor, property, requiredMember(property, memberId), input);
		return workspace(actor, property);
	}

	private void changeRole(UUID actor, UUID property, PropertyMember member, MemberRequests.Role input) {
		// 주민을 관리자 역할로 올리는 권한만 관리소장에게 남깁니다. 일반 업무·주민으로 내리기는 관리자에게 허용합니다.
		if (input.role() == PropertyMemberRole.MANAGER && member.getRole() != PropertyMemberRole.MANAGER)
			requireAdmin(actor, property);
		accounts.requireActive(member.getUserId());
		uniqueMember(property, member.getUserId());
		if (member.getRole() != input.expectedRole() || member.getRole() == PropertyMemberRole.ADMIN
		    || input.role() == PropertyMemberRole.ADMIN || member.getUserId().equals(actor))
			throw failure("MEMBER_ROLE_CONFLICT");
		if (input.role() == PropertyMemberRole.RESIDENT
		    && residents.findByPropertyIdAndUserIdAndDeletedAtIsNull(property, member.getUserId()).size() != 1)
			throw failure("MEMBER_RESIDENT_REQUIRED");
		change(member, input.role(), actor);
		members.flush();
		events.flush();
	}

	/** 한 명의 관리소장만 유지하며 기존 관리소장을 먼저 부담당자로 전환한 뒤 새 관리소장을 지정합니다. 실패하면 모두 롤백합니다. */
	@Transactional
	public void transfer(UUID actor, UUID property, UUID memberId, PropertyMemberRole expected) {
		lock(actor, property);
		requireAdmin(actor, property);
		var target = requiredMember(property, memberId);
		if (target.getUserId().equals(actor) || target.getRole() != expected)
			throw failure("MEMBER_ROLE_CONFLICT");
		accounts.requireActive(target.getUserId());
		uniqueMember(property, target.getUserId());
		List<PropertyMember> chiefs = members.findByPropertyIdAndDeletedAtIsNull(property).stream()
		    .filter(m -> m.isCurrent() && m.getRole() == PropertyMemberRole.ADMIN).toList();
		if (chiefs.size() != 1 || !chiefs.getFirst().getUserId().equals(actor))
			throw failure("MEMBER_ROLE_CONFLICT");
		change(chiefs.getFirst(), PropertyMemberRole.MANAGER, actor);
		// 부분 유일 인덱스 검증 전에 기존 관리소장 행의 변경을 flush하고 다음 지정도 동일 트랜잭션에 묶습니다.
		members.flush();
		change(target, PropertyMemberRole.ADMIN, actor);
		members.flush();
		events.flush();
	}

	/** 미거주 부담당자의 접근 종료는 주민 명부 삭제와 분리합니다. 관리소장은 전용 인계 없이 종료하지 않습니다. */
	@Transactional
	public MemberResponse.Workspace endManager(UUID actor, UUID property, UUID memberId) {
		lock(actor, property);
		var member = requiredMember(property, memberId);
		if (member.getRole() != PropertyMemberRole.MANAGER
		    || !residents.findByPropertyIdAndUserIdAndDeletedAtIsNull(property, member.getUserId()).isEmpty())
			throw failure("MEMBER_ROLE_CONFLICT");
		member.endManagerAccess(now());
		events.save(MemberRoleEvent.record(member, PropertyMemberRole.MANAGER, actor, now()));
		members.flush();
		return workspace(actor, property);
	}

	/** 초대 원문은 최초 발급 응답에만 반환하며 DB·로그에는 해시만 저장합니다. */
	@Transactional
	public MemberResponse.Issued issue(UUID actor, UUID property, UUID residentId) {
		lock(actor, property);
		requireAdmin(actor, property);
		if (residentId != null)
			throw new IllegalArgumentException("Resident access is reviewed in membership requests");
		byte[] bytes = new byte[24];
		new SecureRandom().nextBytes(bytes);
		String code = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
		var invitation = invitations.saveAndFlush(MemberInvitation.issue(property, hash(code), actor, now()));
		temporaryCodes.create(MANAGER, invitation.getId(), property, invitation.getTokenHash(),
		    invitation.getExpiresAt(), null);
		return new MemberResponse.Issued(invitation.getId(), code, invitation.getExpiresAt());
	}

	/** 코드 입력은 계정의 참여 신청만 기록하며 관리소장 승인 전에는 관리 권한과 주민 계정 연결을 만들지 않습니다. */
	@Transactional
	public MemberResponse.Requested claim(UUID actor, String code) {
		accounts.requireActive(actor);
		var hash = hash(code.strip());
		var property = invitations.findPropertyByHash(hash).orElseThrow(() -> failure("INVALID_INVITATION"));
		var target = properties.findForUnitUpdate(property).orElseThrow(() -> failure("INVALID_INVITATION"));
		if (target.getDeletedAt() != null
		    || target.getStatus() != PropertyStatus.ACTIVE)
			throw failure("INVALID_INVITATION");
		var invitation = invitations.findByTokenHash(hash).orElseThrow(() -> failure("INVALID_INVITATION"));
		if (invitation.getRole() != PropertyMemberRole.MANAGER || actor.equals(invitation.getCreatedBy()))
			throw failure("INVALID_INVITATION");
		if ("REQUESTED".equals(invitation.getStatus()) && actor.equals(invitation.getRequestedBy())) {
			temporaryCodes.deleteAfterCommit(MANAGER, invitation.getId());
			return new MemberResponse.Requested(target.getName(), "REQUESTED");
		}
		if (!"ISSUED".equals(invitation.getStatus()))
			throw failure("INVALID_INVITATION");
		temporaryCodes.require(MANAGER, invitation.getId(), property, invitation.getTokenHash(),
		    invitation.getExpiresAt());
		try {
			invitation.request(actor, now());
		} catch (IllegalStateException failure) {
			throw failure("INVALID_INVITATION");
		}
		invitations.flush();
		temporaryCodes.deleteAfterCommit(MANAGER, invitation.getId());
		return new MemberResponse.Requested(target.getName(), "REQUESTED");
	}

	/** 외부 부담당자의 신청 계정을 관리소장이 확인한 뒤 역할과 승인 이력을 함께 저장합니다. */
	@Transactional
	public MemberResponse.Workspace approve(UUID actor, UUID property, UUID id, long revision) {
		lock(actor, property);
		requireAdmin(actor, property);
		var invitation = requiredInvitation(property, id);
		if (invitation.getRole() != PropertyMemberRole.MANAGER)
			throw failure("INVALID_INVITATION");
		if ("APPROVED".equals(invitation.getStatus()))
			return workspace(actor, property);
		if (invitation.getRevision() != revision || !"REQUESTED".equals(invitation.getStatus()))
			throw failure("MEMBER_ROLE_CONFLICT");
		var user = accounts.requireActive(invitation.getRequestedBy());
		List<PropertyMember> existing = members.findByPropertyIdAndUserIdAndDeletedAtIsNull(property, user.getId())
		    .stream().filter(PropertyMember::isCurrent).toList();
		if (existing.size() > 1 || (!existing.isEmpty() && existing.getFirst().getRole() == PropertyMemberRole.ADMIN))
			throw failure("MEMBER_ROLE_CONFLICT");

		if (existing.isEmpty()) {
			var member = members.saveAndFlush(PropertyMember.invited(property, user, invitation.getRole(), now()));
			events.save(MemberRoleEvent.record(member, null, actor, now()));
		} else if (invitation.getRole() == PropertyMemberRole.MANAGER)
			change(existing.getFirst(), PropertyMemberRole.MANAGER, actor);
		invitation.approve(actor, now());
		members.flush();
		residents.flush();
		invitations.flush();
		events.flush();
		return workspace(actor, property);
	}

	@Transactional
	public MemberResponse.Workspace revoke(UUID actor, UUID property, UUID id, long revision) {
		lock(actor, property);
		var invitation = requiredInvitation(property, id);
		if ("REVOKED".equals(invitation.getStatus()))
			return workspace(actor, property);
		if (invitation.getRevision() != revision || "APPROVED".equals(invitation.getStatus()))
			throw failure("MEMBER_ROLE_CONFLICT");
		invitation.revoke(actor, now());
		temporaryCodes.deleteAfterCommit(MANAGER, invitation.getId());
		invitations.flush();
		return workspace(actor, property);
	}

	private MemberInvitation requiredInvitation(UUID property, UUID id) {
		return invitations.findById(id).filter(i -> property.equals(i.getPropertyId()))
		    .orElseThrow(() -> failure("MEMBER_NOT_FOUND"));
	}

	private Resident requiredResident(UUID property, UUID id) {
		return residents.findByIdAndPropertyId(id, property).filter(r -> r.getDeletedAt() == null)
		    .orElseThrow(() -> failure("MEMBER_NOT_FOUND"));
	}

	private String hash(String code) {
		try {
			return HexFormat.of()
			    .formatHex(MessageDigest.getInstance("SHA-256").digest(code.getBytes(StandardCharsets.UTF_8)));
		} catch (NoSuchAlgorithmException failure) {
			throw new IllegalStateException("SHA-256 unavailable");
		}
	}

	private PaymentException failure(String code) {
		return new PaymentException(code);
	}
}
