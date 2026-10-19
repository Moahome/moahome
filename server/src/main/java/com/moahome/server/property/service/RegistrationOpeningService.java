package com.moahome.server.property.service;

import java.time.*;
import java.util.*;
import java.util.stream.Collectors;
import com.moahome.server.banking.domain.BankAccount;
import com.moahome.server.banking.dto.BankingBalanceRequests;
import com.moahome.server.banking.service.BankingBalanceService;
import com.moahome.server.billing.domain.BillingCalendar;
import com.moahome.server.billing.dto.OpeningBalanceRequest;
import com.moahome.server.billing.service.OpeningBalanceService;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.dto.*;
import com.moahome.server.property.exception.RegistrationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/** 등록 트랜잭션 안에서 기존 인계·동별 잔고·첫 부과 서비스를 조합합니다. */
@Service
public class RegistrationOpeningService {
	private final OpeningBalanceService balances;

	private final BankingBalanceService cash;

	private final Clock clock;

	public RegistrationOpeningService(OpeningBalanceService balances, BankingBalanceService cash, Clock clock) {
		this.balances = balances;
		this.cash = cash;
		this.clock = clock;
	}

	/** 명시적인 전체 금액과 날짜를 검증해 누락을 0원으로 추측하거나 다른 세대로 연결하지 않습니다. */
	public void validate(PropertyRegistrationRequest request) {
		var input = request.openingBalances();
		var today = LocalDate.now(clock.withZone(BillingCalendar.ZONE));
		var first = YearMonth.parse(input.firstBillingMonth());
		var current = YearMonth.from(today);
		if (input.cutoffDate().isAfter(today) || !first.atDay(1).isAfter(input.cutoffDate()) || first.isBefore(current)
		    || first.isAfter(current.plusMonths(1))) {
			throw invalid("cutoffDate", "기준일과 첫 부과월을 확인해주세요.");
		}
		Set<RegistrationOpeningService.UnitKey> expectedUnits = request.units().stream()
		    .map(u -> new UnitKey(u.buildingClientId(), u.unitNumber())).collect(Collectors.toSet());
		HashSet<RegistrationOpeningService.UnitKey> seenUnits = new HashSet<UnitKey>();
		for (var row : input.units())
			if (!seenUnits.add(new UnitKey(row.buildingClientId(), row.unitNumber()))) {
				throw invalid("units", "세대별 인계 금액이 중복되었습니다.");
			}
		if (!expectedUnits.equals(seenUnits))
			throw invalid("units", "등록한 모든 세대의 미납·선납을 확인해주세요.");
		HashSet<Integer> seenAccounts = new HashSet<Integer>();
		for (var row : input.accounts())
			if (row.accountIndex() >= request.bankAccounts().size() || !seenAccounts.add(row.accountIndex())) {
				throw invalid("accounts", "등록한 계좌별 실제 잔액을 확인해주세요.");
			}
		if (seenAccounts.size() != request.bankAccounts().size())
			throw invalid("accounts", "계좌 잔액을 모두 입력해주세요.");
		Set<String> expectedBuildings = request.buildings().stream()
		    .map(PropertyRegistrationRequest.BuildingInput::clientId).collect(Collectors.toSet());
		HashSet<String> seenBuildings = new HashSet<String>();
		for (var row : input.buildings())
			if (!seenBuildings.add(row.buildingClientId())) {
				throw invalid("buildings", "동별 보유금이 중복되었습니다.");
			}
		if (!seenBuildings.equals(expectedBuildings))
			throw invalid("buildings", "등록한 모든 동의 보유금을 확인해주세요.");
		if (expectedBuildings.isEmpty()) {
			if (input.cashCutoffDate() != null)
				throw invalid("cashCutoffDate", "동 구분이 없으면 통장 실제 잔액만 입력합니다.");
			return;
		}
		if (input.cashCutoffDate() == null || input.cashCutoffDate().isAfter(today)) {
			throw invalid("cashCutoffDate", "동별 잔고 기준일을 확인해주세요.");
		}
	}

	/** 어느 저장·부과 단계가 실패해도 등록까지 모두 롤백하고 같은 요청 ID로만 재시도합니다. */
	@Transactional(propagation = Propagation.MANDATORY)
	public PropertyRegistrationResponse.ManagementStart initialize(UUID actor, Property property,
	    PropertyRegistrationRequest request, Map<String, Building> buildings, List<Unit> units,
	    List<BankAccount> accounts) {
		var input = request.openingBalances();
		HashMap<RegistrationOpeningService.UnitKey, UUID> unitIds = new HashMap<UnitKey, UUID>();
		for (int index = 0; index < request.units().size(); index++) {
			var row = request.units().get(index);
			unitIds.put(new UnitKey(row.buildingClientId(), row.unitNumber()), units.get(index).getId());
		}
		var batch = balances.save(actor, property.getId(), new OpeningBalanceRequest(null, null, input.cutoffDate(),
		    input.firstBillingMonth(),
		    input.units().stream()
		        .map(row -> new OpeningBalanceRequest.UnitInput(
		            unitIds.get(new UnitKey(row.buildingClientId(), row.unitNumber())), row.receivable(), row.credit(),
		            null, null))
		        .toList(),
		    input.accounts().stream().map(
		        row -> new OpeningBalanceRequest.AccountInput(accounts.get(row.accountIndex()).getId(), row.amount()))
		        .toList()))
		    .batch();
		if (!buildings.isEmpty())
			cash.saveOpenings(actor, property.getId(),
			    new BankingBalanceRequests.Opening(input.cashCutoffDate(), input.buildings().stream()
			        .map(row -> new BankingBalanceRequests.OpeningPart(buildings.get(row.buildingClientId()).getId(),
			            row.amount()))
			        .toList()));
		// 첫 부과·선납 충당은 날짜와 요약을 확인한 최종 제출에서만 확정합니다.
		balances.confirm(actor, property.getId(), batch.id(), batch.revision());
		return new PropertyRegistrationResponse.ManagementStart(input.cutoffDate(), input.firstBillingMonth(),
		    input.cashCutoffDate());
	}

	private RegistrationException invalid(String field, String message) {
		return RegistrationException.invalid("openingBalances." + field, "INVALID_COMBINATION", message);
	}

	private record UnitKey(String buildingClientId, String unitNumber) {
	}
}
