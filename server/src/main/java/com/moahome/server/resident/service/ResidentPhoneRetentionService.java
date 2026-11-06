package com.moahome.server.resident.service;

import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.moahome.server.membership.repo.MembershipRequestRepository;
import com.moahome.server.membership.repo.ResidentInvitationRepository;
import com.moahome.server.resident.domain.Resident;
import com.moahome.server.resident.repo.ResidentImportBatchRepository;

/** 관리대상 쓰기 잠금 안에서 명부 삭제·동의 철회의 연락처 복사본을 함께 파기합니다. */
@Service
public class ResidentPhoneRetentionService {
	private final MembershipRequestRepository requests;
	private final ResidentInvitationRepository invitations;
	private final ResidentImportBatchRepository batches;

	public ResidentPhoneRetentionService(MembershipRequestRepository requests, ResidentInvitationRepository invitations,
	    ResidentImportBatchRepository batches) {
		this.requests = requests;
		this.invitations = invitations;
		this.batches = batches;
	}

	/** 신청·초대의 관계와 승인 이력은 보존하고 번호 보호값만 제거하며 오래된 업로드의 재유입도 막습니다. */
	@Transactional(propagation = Propagation.MANDATORY)
	public void removePhoneCopies(UUID actor, Resident resident, OffsetDateTime at) {
		removePhoneCopies(actor, resident, at, null);
	}

	/** 번호 삭제를 승인 중인 현재 초대만 승인 상태 전이를 이어가고 다른 미완료 초대는 종료합니다. */
	@Transactional(propagation = Propagation.MANDATORY)
	public void removePhoneCopies(UUID actor, Resident resident, OffsetDateTime at, UUID approvingInvitation) {
		requests.findAllLinkedForPhoneRemoval(resident.getPropertyId(), resident.getId(), resident.getUserId())
		    .forEach(request -> request.changePhone(null, null, null, at));
		invitations.findByPropertyIdAndResidentId(resident.getPropertyId(), resident.getId()).forEach(invitation -> {
			if (!invitation.getId().equals(approvingInvitation)
			    && Set.of("ISSUED", "CHANGE_REQUESTED").contains(invitation.getStatus())) {
				invitation.finish("REVOKED", actor, at);
			}
			invitation.clearPhone();
		});
		// 이미 메모리에 읽은 업로드도 행별 저장에서 같은 잠금 아래 배치 존재를 재검사합니다.
		batches.deleteByPropertyId(resident.getPropertyId());
	}
}
