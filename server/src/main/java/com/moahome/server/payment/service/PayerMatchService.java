package com.moahome.server.payment.service;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;
import java.util.regex.Pattern;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.payment.domain.Payment;
import com.moahome.server.payment.dto.PaymentResponse;
import com.moahome.server.payment.repo.PaymentRepository;
import com.moahome.server.resident.dto.ResidentListResponse.ResidentItem;
import org.springframework.stereotype.Service;

/** 현재 명단·최신 확정 이력을 우선하고 없을 때 동-호수 표기 패턴으로 등록 세대를 찾습니다. */
@Service
public class PayerMatchService {
	private static final Pattern UNIT_PAYER_PATTERN =
	    Pattern.compile("([0-9]+)-([0-9]+)(?:\\((?:[1-9]|1[0-2])\\)?)?");

	private final PaymentRepository payments;

	private final PaymentTextSecurity security;

	public PayerMatchService(PaymentRepository payments, PaymentTextSecurity security) {
		this.payments = payments;
		this.security = security;
	}

	public record Context(List<Payment> payments, Map<String, Payment> latestByName) {
	}

	public record Match(UUID unitId, String reason, boolean automatic) {
	}

	/** 업로드할 때 입금자명별 최신 확정 이력을 한 번에 조회해 각 행에서 재사용합니다. */
	public Context context(UUID property) {
		return new Context(payments.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(property),
		    payments.findLatestConfirmedPayers(property).stream()
		        .collect(Collectors.toMap(Payment::getPayerNameHmac, p -> p)));
	}

	/** 마지막 호 생략은 동·호수에만 허용하고 입금자명은 기존 NFC·공백 정규화의 완전 일치를 사용합니다. */
	private boolean matchesUnitLabel(String hash, String label) {
		if (security.nameHash(label).equals(hash))
			return true;
		return label.endsWith("호") && security.nameHash(label.substring(0, label.length() - 1)).equals(hash);
	}

	/** 명단·최신 확정 이력을 먼저 대조하고 둘 다 없을 때 동-호수 패턴으로 등록된 세대를 찾습니다. */
	public Match resolve(Context context, String payer, LocalDate date, List<PaymentResponse.Unit> units,
	    List<ResidentItem> residents) {
		String hash = security.nameHash(payer);
		Set<UUID> eligible = units.stream().filter(PaymentResponse.Unit::eligible).map(PaymentResponse.Unit::id)
		    .collect(Collectors.toSet());
		Set<UUID> named = units.stream().filter(u -> eligible.contains(u.id()) && matchesUnitLabel(hash, u.label()))
		    .map(PaymentResponse.Unit::id).collect(Collectors.toSet());
		residents.stream().filter(r -> eligible.contains(r.unitId()) && security.nameHash(r.name()).equals(hash))
		    .map(ResidentItem::unitId).forEach(named::add);
		if (named.size() == 1)
			return new Match(named.iterator().next(),
			    units.stream().anyMatch(u -> matchesUnitLabel(hash, u.label())) ? "동·호수 일치" : "명단 이름 일치", true);
		if (named.size() > 1)
			return new Match(null, "명단 이름 충돌", false);
		Payment latest = context.latestByName().get(hash);
		if (latest != null) {
			if (!eligible.contains(latest.getMatchedUnitId()))
				return new Match(null, "", false);
			// 오래된 다른 세대 이력은 충돌로 남기지 않으며 최신 확정 이력 한 건의 세대를 사용합니다.
			return new Match(latest.getMatchedUnitId(), "최근 입금자명 일치", true);
		}
		return matchUnitPattern(payer, units);
	}

	/** 숫자 동-호수와 선택적인 1~12 월 표시만 해석하며 닫는 괄호가 없는 은행 표시도 허용합니다. */
	private Match matchUnitPattern(String payer, List<PaymentResponse.Unit> units) {
		var pattern = UNIT_PAYER_PATTERN.matcher(payer.replaceAll("(?U)\\s+", ""));
		if (!pattern.matches())
			return new Match(null, "", false);
		String building = pattern.group(1);
		String unitNumber = pattern.group(2);
		List<UUID> candidates = units.stream().filter(PaymentResponse.Unit::eligible)
		    .filter(unit -> matchesPatternUnit(unit, building, unitNumber)).map(PaymentResponse.Unit::id).toList();
		if (candidates.size() != 1)
			return new Match(null, candidates.isEmpty() ? "" : "동·호수 패턴 충돌", false);
		// 괄호의 월은 세대 식별에서만 제외하며 원본 입금자명과 실제 청구 충당 순서는 바꾸지 않습니다.
		return new Match(candidates.getFirst(), "동·호수 패턴 일치", true);
	}

	/** 동 이름을 먼저 확인해 다른 동·호수의 숫자를 붙였을 때 우연히 같은 문자열이 되는 매칭을 막습니다. */
	private boolean matchesPatternUnit(PaymentResponse.Unit unit, String building, String unitNumber) {
		String buildingName = unit.buildingName();
		if (buildingName == null)
			return false;
		String compactBuilding = buildingName.replaceAll("(?U)\\s+", "");
		if (!compactBuilding.equals(building) && !compactBuilding.equals(building + "동"))
			return false;
		return security.nameHash(unit.label()).equals(security.nameHash(buildingName + unitNumber + "호"));
	}
}
