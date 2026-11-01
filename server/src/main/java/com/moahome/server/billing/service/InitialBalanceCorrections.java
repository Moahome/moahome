package com.moahome.server.billing.service;

import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;
import com.moahome.server.billing.domain.*;
import com.moahome.server.billing.dto.InitialBalanceCorrection;
import com.moahome.server.billing.repo.InitialBalanceChangeRepository;
import com.moahome.server.common.validation.TextValues;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.property.domain.Property;
import com.moahome.server.user.repo.UserRepository;

/** 모든 초기 기준 정정 경로에 같은 잠금 기한과 불변 감사 이력·재시도 검증을 적용합니다. */
@Service
public class InitialBalanceCorrections {
	private final InitialBalanceChangeRepository changes;

	private final ObjectMapper mapper;

	private final Clock clock;

	private final UserRepository users;

	public InitialBalanceCorrections(InitialBalanceChangeRepository changes, ObjectMapper mapper, Clock clock,
	    UserRepository users) {
		this.changes = changes;
		this.mapper = mapper;
		this.clock = clock;
		this.users = users;
	}

	/** 최초 첫 부과월을 기준으로 기한을 정하므로 기준일 정정·재인계로 기한이 연장되지 않습니다. */
	public LocalDate deadline(Property property) {
		if (property.getInitialCorrectionDeadline() != null)
			return property.getInitialCorrectionDeadline();
		return property.getFirstBillingMonth() == null ? null
		    : YearMonth.from(property.getFirstBillingMonth()).atEndOfMonth();
	}

	/** 한국시간 월말까지 허용하며 날짜가 바뀌는 첫 순간부터 저장 경로 전체를 잠급니다. */
	public boolean allowed(Property property) {
		LocalDate limit = deadline(property);
		return limit != null && !LocalDate.now(clock.withZone(BillingCalendar.ZONE)).isAfter(limit);
	}

	public void requireAllowed(Property property) {
		if (!allowed(property))
			throw new PaymentException("INITIAL_BALANCE_LOCKED");
	}

	/** 성공한 동일 요청은 기한이 지난 뒤에도 재적용하지 않으며 다른 본문·대상·처리자의 ID 재사용은 거부합니다. */
	public boolean replay(UUID id, UUID property, UUID actor, String kind, Object input) {
		var saved = changes.findById(id).orElse(null);
		if (saved == null)
			return false;
		if (!property.equals(saved.getPropertyId()) || !actor.equals(saved.getChangedBy())
		    || !kind.equals(saved.getKind()) || !mapper.writeValueAsString(input).equals(saved.getRequestBody()))
			throw new PaymentException(switch (kind) {
				case "ACCOUNT" -> "BANK_OPENING_CONFLICT";
				case "BUILDING" -> "CASH_OPENING_CONFLICT";
				default -> "INITIAL_BALANCE_CONFLICT";
			});
		return true;
	}

	/** 호출자는 관리대상 잠금과 정정 검증 후 이력을 원천 값 변경과 같은 트랜잭션에 저장합니다. */
	public void record(UUID id, UUID property, UUID actor, String kind, Object input, String reason,
	    LocalDate previous, LocalDate next, List<InitialBalanceCorrection.Detail> details) {
		changes.saveAndFlush(InitialBalanceChange.record(id, property, kind, mapper.writeValueAsString(input),
		    previous, next, mapper.writeValueAsString(details), TextValues.required(reason, 500), actor,
		    OffsetDateTime.now(clock)));
	}

	/** 인계 화면의 관리 권한을 확인한 호출자에게만 전후 값과 현재 변경자 표시명을 반환합니다. */
	public List<InitialBalanceCorrection.History> history(UUID property) {
		return changes.findByPropertyIdOrderByChangedAtDesc(property).stream().map(row ->
		    new InitialBalanceCorrection.History(row.getId(), row.getKind(), row.getPreviousDate(), row.getNewDate(),
		        Arrays.asList(mapper.readValue(row.getDetails(), InitialBalanceCorrection.Detail[].class)),
		        row.getReason(), row.getChangedBy(),
		        users.findById(row.getChangedBy()).map(u -> u.getDisplayName()).orElse("탈퇴한 사용자"),
		        row.getChangedAt())).toList();
	}
}
