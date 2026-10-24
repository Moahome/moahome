package com.moahome.server.membership.service;

import java.time.*;
import java.util.*;
import com.moahome.server.auth.exception.*;
import com.moahome.server.membership.domain.*;
import com.moahome.server.membership.dto.ResidentInvitations;
import com.moahome.server.membership.repo.ResidentJoinCodeRepository;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.property.service.ManagementAccessService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;

/** 코드 검증은 조회·신청 양쪽에서 수행하며 명부 신청의 잠금과 같은 관리대상 잠금을 사용합니다. */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ResidentJoinCodeService {
	private final ResidentJoinCodeRepository codes;

	private final PropertyRepository properties;

	private final ManagementAccessService access;

	private final Clock clock;
	/** 최종 신청에서도 같은 관리대상·현재 코드·24시간 기한을 재검증합니다. */
	public ResidentJoinCode require(UUID property, String value) {
		var code = codes.findByCodeHash(ResidentInviteCode.hash(value))
		    .filter(c -> c.getPropertyId().equals(property) && c.isLive(OffsetDateTime.now(clock)))
		    .orElseThrow(() -> new PaymentException("INVALID_INVITATION"));
		return code;
	}

	/** 유효한 공통 코드에서만 가입할 관리대상을 결정하며 주민 정보는 반환하지 않습니다. */
	public UUID property(String value) {
		var code = codes.findByCodeHash(ResidentInviteCode.hash(value)).filter(c -> c.isLive(OffsetDateTime.now(clock)))
		    .orElseThrow(() -> new PaymentException("INVALID_INVITATION"));
		return code.getPropertyId();
	}

	private void lock(UUID actor, UUID property) {
		properties.findForUnitUpdate(property).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		access.getManagementContext(actor, property);
	}

	/** 원문은 발급 응답에만 제공하고 재발급하면 이전 공통 코드를 모두 폐기합니다. 기존 신청은 유지합니다. */
	@Transactional
	public ResidentInvitations.Issued issue(UUID actor, UUID property) {
		lock(actor, property);
		codes.findByPropertyIdAndStatus(property, "ISSUED").forEach(ResidentJoinCode::revoke);
		codes.flush();
		String value = ResidentInviteCode.create("B");
		var code = codes.saveAndFlush(
		    ResidentJoinCode.issue(property, ResidentInviteCode.hash(value), actor, OffsetDateTime.now(clock)));
		return new ResidentInvitations.Issued(code.getId(), value, code.getExpiresAt());
	}

	/** 공통 코드를 폐기해 새 가입을 막고 이미 제출한 신청과 가입 권한은 보존합니다. */
	@Transactional
	public void revoke(UUID actor, UUID property) {
		lock(actor, property);
		codes.findByPropertyIdAndStatus(property, "ISSUED").forEach(ResidentJoinCode::revoke);
		codes.flush();
	}
}
